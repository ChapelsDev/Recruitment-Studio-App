package local.recruitment.recruitment_studio.documents

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.PluginRegistry.ActivityResultListener
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

internal class DocumentCapacityException : Exception()
internal data class DocumentDigest(val bytes: Long, val sha256: String) {
    fun matches(other: DocumentDigest) = bytes == other.bytes && sha256 == other.sha256
}
/** Shared by real resolver writes and JVM fault contracts. No readAllBytes. */
internal object DocumentTransfer {
    const val CHUNK = 64 * 1024
    const val MAXIMUM = 512L * 1024 * 1024
    fun authorized(actualOp: String, expectedOp: String, name: String, approved: String) =
        actualOp == expectedOp && name == approved
    fun copyBounded(input: InputStream, output: OutputStream?, maximum: Long,
                    stopped: () -> Boolean = { false }): DocumentDigest {
        if (maximum < 0 || maximum > MAXIMUM) throw DocumentCapacityException()
        val hash = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(CHUNK)
        var count = 0L
        while (true) {
            if (stopped()) throw DocumentCancelledException()
            val n = input.read(buffer, 0, minOf(CHUNK.toLong(), maximum - count + 1).toInt())
            if (n < 0) break
            if (n == 0) throw java.io.IOException("Unavailable read")
            count += n
            if (count > maximum) throw DocumentCapacityException()
            hash.update(buffer, 0, n)
            output?.write(buffer, 0, n)
        }
        return DocumentDigest(count, hash.digest().joinToString("") { "%02x".format(it) })
    }
    fun digest(input: InputStream, maximum: Long) = input.use { copyBounded(it, null, maximum) }
    fun writeAndVerify(source: () -> InputStream, output: () -> OutputStream,
                       reopen: () -> InputStream, expected: DocumentDigest): DocumentDigest {
        val written = output().use { sink ->
            source().use { input -> copyBounded(input, sink, expected.bytes) }.also { sink.flush() }
        } // output close MUST finish successfully before reopening provider
        if (!written.matches(expected)) throw java.io.IOException("Changed source")
        val actual = digest(reopen(), expected.bytes)
        if (!actual.matches(expected)) throw java.io.IOException("Unconfirmed output")
        return actual
    }
}
internal class DocumentCancelledException : Exception()
internal object DocumentIntents {
    fun open(mimes: Array<String>) = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = if (mimes.size == 1) mimes[0] else "*/*"
        if (mimes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimes)
        flags = Intent.FLAG_GRANT_READ_URI_PERMISSION
    }
    fun create(name: String, mime: String) = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE); type = mime
        putExtra(Intent.EXTRA_TITLE, name)
        flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
    }
}

/** Session-only opaque SAF capabilities. No persisted grants, caller URI/path,
 * external logs or unbounded executor queue. I/O and provider queries are never
 * performed on the UI thread. Native targets/transfers remain bounded to 32/1.
 */
class DocumentBridgePlugin : FlutterPlugin, ActivityAware, ActivityResultListener, MethodChannel.MethodCallHandler {
    private lateinit var context: Context
    private var channel: MethodChannel? = null
    private var activity: Activity? = null
    private var activityBinding: ActivityPluginBinding? = null
    private val ui = Handler(Looper.getMainLooper())
    private val lock = Any()
    private val epochs = DocumentEpochs()
    private val custody = DocumentUriCustody(32)
    private val privateFiles = DocumentPrivateFileCustody(1)
    private var privateFileOp: String? = null
    private var privateFileTarget: String? = null
    private val acquisitions = LinkedHashMap<Int, Picker>()
    private val io = DocumentCleanupExecutor { cleanupAll() }
    private val targets = LinkedHashMap<String, Target>()
    private val stopped = LinkedHashSet<String>()
    private var read: ReadTransfer? = null
    private var write: WriteTransfer? = null
    private var picker: Picker? = null
    private val retiredPickers = LinkedHashMap<Int, Picker>()
    private var nextRequestCode = 52081
    private var engineAttached = false

    private data class Target(val uri: Uri, val op: String, val displayName: String,
                              val approvedName: String?, val placeholder: Boolean,
                              var committed: Boolean = false, var aborted: Boolean = false,
                              var residual: Boolean = false,
                              var opening: Boolean = false,
                              val lease: DocumentUriCustody.Lease)
    private data class Picker(val op: String, val names: List<String>?, val result: Once,
                              val requestCode: Int, val epoch: DocumentEpoch,
                              val abandoned: Boolean = false)
    private fun retirePicker() {
        val p = picker ?: return
        picker = null
        retiredPickers[p.requestCode] = p.copy(abandoned = true)
        p.result.send(mapOf("status" to "cancelled", "residualPlaceholder" to (p.names != null)))
    }
    private data class ReadTransfer(val id: String, val op: String, val target: String,
                                    val input: InputStream, val maximum: Long, var count: Long = 0)
    private data class WriteTransfer(val id: String, val op: String, val target: String,
                                     val file: File, val output: FileOutputStream,
                                     val maximum: Long, val expected: String, var count: Long = 0,
                                     var closed: Boolean = false)
    private class Once(private val result: MethodChannel.Result, private val ui: Handler) {
        private val done = AtomicBoolean(false)
        fun send(map: Map<String, Any?>) {
            if (!done.compareAndSet(false, true)) return
            ui.post { result.success(map) }
        }
        fun sendGuarded(map: Map<String, Any?>, valid: () -> Boolean, after: () -> Unit) {
            ui.post {
                try {
                    if (done.compareAndSet(false, true)) result.success(
                        if (valid()) map else mapOf("status" to "cancelled",
                            "residualPlaceholder" to (map["ownsReservedPlaceholder"] == true || map["residualPlaceholder"] == true)))
                } finally { after() }
            }
        }
    }
    private fun token() = UUID.randomUUID().toString()
    private fun value(args: Map<*, *>, key: String, maximum: Int = 128): String {
        val text = args[key] as? String ?: throw IllegalArgumentException()
        if (text.isEmpty() || text.length > maximum || text.indexOf('\u0000') >= 0) throw IllegalArgumentException()
        return text
    }
    private fun limit(args: Map<*, *>, key: String): Long {
        val n = (args[key] as? Number)?.toLong() ?: throw IllegalArgumentException()
        if (n < 0 || n > DocumentTransfer.MAXIMUM) throw DocumentCapacityException()
        return n
    }
    private fun cancelled(op: String) = synchronized(lock) { !epochs.live() || stopped.contains(op) }
    private fun current(p: Picker) = synchronized(lock) {
        !p.abandoned && !stopped.contains(p.op) && epochs.current(p.epoch)
    }
    private fun target(id: String, op: String): Target = synchronized(lock) {
        targets[id]?.takeIf { it.op == op } ?: throw IllegalArgumentException()
    }
    private fun failed(error: Exception, residual: Boolean = false): Map<String, Any?> = mapOf(
        "status" to "failed", "problem" to when (error) {
            is SecurityException -> "permissionDenied"
            is DocumentCapacityException -> "capacityExceeded"
            is DocumentCancelledException -> "operationCancelled"
            is IllegalArgumentException -> "invalidSelection"
            else -> "ioFailure"
        }, "residualPlaceholder" to residual)
    private fun background(result: Once, residualOnReject: Boolean = false, acquired: Picker? = null,
                           task: () -> Map<String, Any?>) {
        if (!io.submit {
            val response = try { task() } catch (e: Exception) { failed(e) }
            if (acquired == null) result.send(response)
            else result.sendGuarded(response, { current(acquired) }, {
                synchronized(lock) { acquisitions.remove(acquired.requestCode) }
            })
        }) {
            result.send(failed(DocumentCapacityException(), residualOnReject))
            if (acquired != null) synchronized(lock) { acquisitions.remove(acquired.requestCode) }
        }
    }
    private fun display(uri: Uri): String {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null).use { cursor ->
            if (cursor == null || !cursor.moveToFirst()) throw java.io.IOException("No provider name")
            val name = cursor.getString(0) ?: throw java.io.IOException("No provider name")
            if (name.isEmpty() || name.length > 240 || name.any { it < ' ' || it == '/' || it == '\\' }) throw IllegalArgumentException()
            return name // actual provider name, never an invented fallback
        }
    }
    private fun input(uri: Uri) = context.contentResolver.openInputStream(uri) ?: throw java.io.IOException("Unavailable input")
    private fun empty(target: Target): Boolean = input(target.uri).use { it.read() < 0 }
    private fun removePlaceholder(t: Target): Boolean {
        if (!t.placeholder || t.committed || t.opening) return t.committed || t.opening
        if (!synchronized(lock) { custody.owns(t.lease) }) return true
        return try {
            if (display(t.uri) != t.displayName || !empty(t)) true
            else !DocumentsContract.deleteDocument(context.contentResolver, t.uri)
        } catch (_: Exception) { true }
    }
    private fun cleanupWrite() {
        val w = write ?: return
        val failure = DocumentCleanupAttempts.run(
            { if (!w.closed) { w.output.close(); w.closed = true } },
            { if (w.file.exists() && !w.file.delete()) throw java.io.IOException("Staging deletion failed") })
        if (failure != null) throw failure
        write = null // verified close AND deletion; a first failure keeps retry identity
    }
    private fun cleanupRead() {
        val r = read ?: return
        r.input.close(); read = null
    }
    private fun removeTarget(id: String, t: Target) = synchronized(lock) {
        if (targets[id] === t) { targets.remove(id); custody.release(t.lease) }
    }
    private fun cleanupTargets(op: String? = null) {
        val owned = synchronized(lock) { targets.filterValues { op == null || it.op == op } }
        var residual = false
        owned.forEach { (id, t) ->
            val transferLive = read?.target == id || write?.target == id
            t.residual = transferLive || removePlaceholder(t)
            // No committed output is deleted. Detach has no caller to acknowledge
            // a partial output diagnostic: keep that identity in the failed barrier.
            // Undeleted empty placeholders/failed stream close also retain identity.
            if (!transferLive && !t.residual) removeTarget(id, t)
            else residual = true
        }
        if (residual) throw java.io.IOException("Unresolved document cleanup")
    }
    private fun cleanupAll(): Exception? = DocumentCleanupAttempts.run(
        { cleanupRead() }, { cleanupWrite() }, { cleanupTargets() }, { cleanupPrivateFiles() })
    private fun cleanupPrivateFiles(op: String? = null, target: String? = null) {
        if ((op != null && privateFileOp != op) || (target != null && privateFileTarget != target)) return
        val failure = privateFiles.cleanup { !it.exists() || it.delete() }
        if (privateFiles.size == 0) { privateFileOp = null; privateFileTarget = null }
        if (failure != null) throw failure
    }
    private fun invalidateAcquisitions() {
        retirePicker()
        synchronized(lock) {
            acquisitions.values.forEach { it.result.send(mapOf("status" to "cancelled",
                "residualPlaceholder" to (it.names != null))) }
        }
    }

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        synchronized(lock) { engineAttached = true; epochs.attachEngine() }
        channel = MethodChannel(binding.binaryMessenger, "local.recruitment/documents").also { it.setMethodCallHandler(this) }
    }
    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel?.setMethodCallHandler(null); channel = null
        synchronized(lock) { engineAttached = false; epochs.detachEngine() }
        invalidateAcquisitions()
        // Reserved FIFO barrier cannot be rejected by the four ordinary slots.
        // Its shared terminal records failure; unresolved identities are retained.
        io.requestCleanup(true)
    }
    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activityBinding = binding; activity = binding.activity; binding.addActivityResultListener(this)
        synchronized(lock) { epochs.attachActivity() }
    }
    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) = onAttachedToActivity(binding)
    private fun detach(rotation: Boolean) {
        activityBinding?.removeActivityResultListener(this); activityBinding = null; activity = null
        if (!rotation) {
            synchronized(lock) { epochs.detachActivity(false) }
            invalidateAcquisitions()
            io.requestCleanup(false)
        }
    }
    override fun onDetachedFromActivityForConfigChanges() = detach(true)
    override fun onDetachedFromActivity() = detach(false)

    private fun validateArgs(method: String, args: Map<*, *>) {
        val keys = when (method) {
            "pickOpen" -> setOf("operationId", "mimeTypes")
            "prepareSave" -> setOf("operationId", "names", "mime")
            "beginRead", "stageRead" -> setOf("operationId", "opaqueId", "maximumBytes")
            "readChunk" -> setOf("operationId", "transferId", "offset", "length")
            "endRead" -> setOf("operationId", "transferId")
            "beginWrite" -> setOf("operationId", "opaqueId", "maximumBytes", "expectedSha256")
            "writeChunk" -> setOf("operationId", "transferId", "bytes")
            "writePrepared" -> setOf("operationId", "opaqueId", "transferId", "selectedName", "expectedBytes", "expectedSha256")
            "abortPrepared" -> setOf("operationId", "opaqueId")
            "abortWrite" -> setOf("operationId", "opaqueId", "releaseTarget")
            "releaseOperation" -> setOf("operationId")
            else -> throw IllegalArgumentException()
        }
        if (args.keys.any { it !is String || !keys.contains(it) }) throw IllegalArgumentException()
        // Check payloads BEFORE executor admission; queued chunks cannot be
        // giant arrays that are only refused once the worker finally sees them.
        for ((key, item) in args) {
            when (item) {
                is String -> if (item.length > 240 || item.indexOf('\u0000') >= 0) throw IllegalArgumentException()
                is ByteArray -> if (key != "bytes" || item.size > DocumentTransfer.CHUNK) throw DocumentCapacityException()
                is List<*> -> if (item.size > 8 || item.any { it !is String || it.length > 240 }) throw DocumentCapacityException()
                is Number -> if ((item !is Int && item !is Long) || item.toLong() < 0 || item.toLong() > DocumentTransfer.MAXIMUM) throw DocumentCapacityException()
                is Boolean -> if (key != "releaseTarget") throw IllegalArgumentException()
                else -> throw IllegalArgumentException()
            }
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        val once = Once(result, ui)
        try {
            val args = call.arguments as? Map<*, *> ?: throw IllegalArgumentException()
            if (args.size > 8) throw IllegalArgumentException()
            validateArgs(call.method, args)
            val op = value(args, "operationId", 64)
            if (call.method == "pickOpen" || call.method == "prepareSave") {
                startPicker(call.method, args, op, once); return
            }
            if (call.method == "releaseOperation") {
                synchronized(lock) { if (stopped.size >= 32 && !stopped.contains(op)) throw DocumentCapacityException(); stopped.add(op) }
                if (picker?.op == op) retirePicker()
            }
            val teardown = io.settlement()
            if (teardown != null && call.method in setOf("abortPrepared", "abortWrite", "endRead", "releaseOperation")) {
                teardown.thenAccept { failure ->
                    once.send(if (failure == null) mapOf("status" to "released", "residualPlaceholder" to false)
                        else failed(failure, true))
                }
                return
            }
            background(once) { dispatch(call.method, args, op) }
        } catch (e: Exception) { once.send(failed(e)) }
    }
    private fun startPicker(method: String, args: Map<*, *>, op: String, once: Once) {
        val host = activity ?: throw DocumentCancelledException()
        if (!io.resume()) throw DocumentCancelledException()
        if (picker != null || retiredPickers.size + acquisitions.size >= 32 || nextRequestCode > 65535 || synchronized(lock) { targets.size >= 32 }) throw DocumentCapacityException()
        if (cancelled(op)) throw DocumentCancelledException()
        val names: List<String>?
        val intent: Intent
        if (method == "prepareSave") {
            val list = args["names"] as? List<*> ?: throw IllegalArgumentException()
            if (list.size != 1) throw IllegalArgumentException() // explicit ZIP alternative in Dart
            val name = list[0] as? String ?: throw IllegalArgumentException()
            if (name.isEmpty() || name.length > 240 || name.any { it < ' ' || it == '/' || it == '\\' }) throw IllegalArgumentException()
            val mime = value(args, "mime")
            if (!mime.contains('/')) throw IllegalArgumentException()
            names = listOf(name); intent = DocumentIntents.create(name, mime)
        } else {
            val list = args["mimeTypes"] as? List<*> ?: throw IllegalArgumentException()
            if (list.isEmpty() || list.size > 8) throw IllegalArgumentException()
            val mimes = list.map { it as? String ?: throw IllegalArgumentException() }
            if (mimes.any { it.length > 128 || !it.contains('/') }) throw IllegalArgumentException()
            names = null; intent = DocumentIntents.open(mimes.toTypedArray())
        }
        val requestCode = nextRequestCode++
        picker = Picker(op, names, once, requestCode, synchronized(lock) { epochs.capture() })
        try { host.startActivityForResult(intent, requestCode) }
        catch (e: Exception) { picker = null; throw e }
    }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        val active = picker
        val pending = if (active?.requestCode == requestCode) {
            picker = null; active
        } else retiredPickers.remove(requestCode) ?: return false
        if (resultCode != Activity.RESULT_OK || data?.data == null) {
            pending.result.send(mapOf("status" to "cancelled")); return true
        }
        val uri = data.data!!
        val flags = data.flags
        if (uri.scheme != "content" || uri.toString().length > 4096) {
            pending.result.send(failed(IllegalArgumentException(), pending.names != null))
            return true
        }
        synchronized(lock) { acquisitions[pending.requestCode] = pending }
        background(pending.result, pending.names != null, pending) {
            var created: Target? = null
            try {
                if (uri.scheme != "content" || uri.toString().length > 4096) throw IllegalArgumentException()
                if (flags and Intent.FLAG_GRANT_READ_URI_PERMISSION == 0) throw SecurityException()
                if (pending.names != null && flags and Intent.FLAG_GRANT_WRITE_URI_PERMISSION == 0) throw SecurityException()
                val name = display(uri)
                val id = token()
                val t = synchronized(lock) {
                    // Admission grants deletion custody. A duplicate URI throws
                    // BEFORE created is assigned; no refusal may delete it.
                    val lease = custody.claim(uri.toString())
                    Target(uri, pending.op, name, pending.names?.single(), pending.names != null,
                        lease = lease).also {
                            targets[id] = it; created = it
                            if (!current(pending)) throw DocumentCancelledException()
                        }
                }
                created = t
                if (pending.names != null && !empty(t)) throw java.io.IOException("Not a new empty document")
                synchronized(lock) {
                    if (!current(pending)) throw DocumentCancelledException()
                }
                mapOf("status" to if (pending.names == null) "picked" else "prepared", "opaqueId" to id,
                    "operationId" to pending.op, "displayName" to name, "canReadBack" to true,
                    "ownsReservedPlaceholder" to (pending.names != null), "providerMayRename" to true)
            } catch (e: Exception) {
                val residual = created?.let { t ->
                    t.residual = removePlaceholder(t)
                    if (!t.residual) {
                        val id = synchronized(lock) { targets.entries.firstOrNull { it.value === t }?.key }
                        if (id != null) removeTarget(id, t)
                    }
                    t.residual
                } ?: (pending.names != null)
                failed(e, residual)
            }
        }
        return true
    }
    private fun dispatch(method: String, args: Map<*, *>, op: String): Map<String, Any?> {
        when (method) {
            "releaseOperation" -> {
                val failure = DocumentCleanupAttempts.run(
                    { if (read?.op == op) cleanupRead() },
                    { if (write?.op == op) cleanupWrite() },
                    { cleanupTargets(op) }, { cleanupPrivateFiles(op) })
                if (failure == null) synchronized(lock) { stopped.remove(op) }
                return if (failure == null) mapOf("status" to "released", "residualPlaceholder" to false)
                    else failed(failure, true)
            }
            "abortPrepared" -> {
                val id = value(args, "opaqueId")
                val t = synchronized(lock) { targets[id] }
                    ?: return mapOf("status" to "released", "residualPlaceholder" to false)
                if (t.op != op) throw IllegalArgumentException()
                val failure = DocumentCleanupAttempts.run(
                    { if (read?.target == id) cleanupRead() },
                    { if (write?.target == id) cleanupWrite() },
                    { cleanupPrivateFiles(op, id) },
                    {
                        if (!t.aborted || (t.residual && !t.committed && !t.opening)) {
                            t.residual = removePlaceholder(t); t.aborted = true
                        }
                    })
                if (failure != null) return failed(failure, true)
                return mapOf("status" to "aborted", "residualPlaceholder" to t.residual,
                    "commitState" to if (t.committed) "committed" else if (t.opening) "opening" else "reserved")
            }
            "abortWrite" -> {
                val id = value(args, "opaqueId")
                val t = synchronized(lock) { targets[id] }
                if (t != null && t.op != op) throw IllegalArgumentException()
                val w = write
                if (w != null && DocumentTransferCustody.matches(w.op, w.target, op, id)) cleanupWrite()
                if (args["releaseTarget"] == true) {
                    synchronized(lock) {
                        val t = targets[id]
                        if (t != null && (t.op != op || (!t.committed && !t.aborted))) throw IllegalArgumentException()
                        // Explicit releaseTarget acknowledges the preceding
                        // abort diagnostic. It never deletes provider output.
                        if (t != null) { targets.remove(id); custody.release(t.lease) }
                    }
                }
                return mapOf("status" to "released")
            }
            "endRead" -> {
                val r = read
                if (r != null && (r.op != op || r.id != value(args, "transferId"))) throw IllegalArgumentException()
                cleanupRead(); return mapOf("status" to "released")
            }
        }
        if (cancelled(op) && method != "beginRead" && method != "readChunk") throw DocumentCancelledException()
        when (method) {
            "beginRead", "stageRead" -> {
                if (read != null) throw DocumentCapacityException()
                val id = value(args, "opaqueId"); val t = target(id, op)
                if (t.aborted || (cancelled(op) && !t.committed)) throw DocumentCancelledException()
                val maximum = limit(args, "maximumBytes"); val transfer = token()
                read = ReadTransfer(transfer, op, id, input(t.uri), maximum)
                return mapOf("status" to "ready", "transferId" to transfer)
            }
            "readChunk" -> {
                val r = read ?: throw IllegalArgumentException()
                if (r.op != op || r.id != value(args, "transferId") || (args["offset"] as? Number)?.toLong() != r.count) throw IllegalArgumentException()
                val length = (args["length"] as? Number)?.toInt() ?: throw IllegalArgumentException()
                if (length < 1 || length > DocumentTransfer.CHUNK) throw DocumentCapacityException()
                val bytes = ByteArray(minOf(length.toLong(), r.maximum - r.count + 1).toInt())
                val n = r.input.read(bytes)
                if (n < 0) return mapOf("status" to "ready", "bytes" to ByteArray(0))
                if (n == 0) throw java.io.IOException("Unavailable read")
                r.count += n
                if (r.count > r.maximum) throw DocumentCapacityException()
                return mapOf("status" to "ready", "bytes" to if (n == bytes.size) bytes else bytes.copyOf(n))
            }
            "beginWrite" -> {
                if (write != null || privateFiles.size != 0) throw DocumentCapacityException()
                val id = value(args, "opaqueId"); val t = target(id, op)
                if (!t.placeholder || t.committed || t.opening || t.aborted || display(t.uri) != t.displayName || !empty(t)) throw IllegalArgumentException()
                val maximum = limit(args, "maximumBytes"); val expected = value(args, "expectedSha256", 64)
                if (!expected.matches(Regex("[a-f0-9]{64}"))) throw IllegalArgumentException()
                val file = File.createTempFile("document-", ".stage", context.cacheDir)
                privateFileOp = op; privateFileTarget = id
                privateFiles.own(file) // output constructor cannot orphan its producer file
                try {
                    val transfer = token(); write = WriteTransfer(transfer, op, id, file, FileOutputStream(file), maximum, expected)
                    privateFiles.transfer(file) // verified transfer to WriteTransfer custody
                    privateFileOp = null; privateFileTarget = null
                    return mapOf("status" to "ready", "transferId" to transfer)
                } catch (e: Exception) {
                    try { cleanupPrivateFiles(op, id) } catch (_) { /* retain exact paid cache file */ }
                    throw e
                }
            }
            "writeChunk" -> {
                val w = write ?: throw IllegalArgumentException()
                if (w.op != op || w.id != value(args, "transferId") || w.closed) throw IllegalArgumentException()
                val bytes = args["bytes"] as? ByteArray ?: throw IllegalArgumentException()
                if (bytes.size > DocumentTransfer.CHUNK || bytes.size.toLong() > w.maximum - w.count) throw DocumentCapacityException()
                w.output.write(bytes); w.count += bytes.size
                return mapOf("status" to "ready")
            }
            "writePrepared" -> {
                val w = write ?: throw IllegalArgumentException()
                val id = value(args, "opaqueId"); val t = target(id, op)
                val name = value(args, "selectedName", 240)
                if (w.op != op || w.target != id || w.id != value(args, "transferId") ||
                    !DocumentTransfer.authorized(op, t.op, name, t.approvedName ?: "")) throw IllegalArgumentException()
                try {
                    if (w.closed) throw IllegalArgumentException()
                    try { w.output.flush(); w.output.fd.sync() }
                    finally { w.output.close(); w.closed = true }
                    val expected = DocumentDigest(limit(args, "expectedBytes"), value(args, "expectedSha256", 64))
                    if (expected.bytes != w.count || expected.bytes != w.maximum || expected.sha256 != w.expected ||
                        !DocumentTransfer.digest(FileInputStream(w.file), w.maximum).matches(expected)) throw java.io.IOException("Changed staging")
                    if (display(t.uri) != t.displayName || !empty(t)) throw IllegalArgumentException()
                    if (cancelled(op)) throw DocumentCancelledException()
                    val actual = DocumentTransfer.writeAndVerify({ FileInputStream(w.file) },
                        {
                            // Earlier staging/name/digest failures are RESERVED.
                            // Once provider open is attempted, preserve uncertain
                            // effects even if the provider throws after truncating.
                            t.opening = true
                            val output = context.contentResolver.openOutputStream(t.uri, "wt")
                                ?: throw java.io.IOException("Unavailable output")
                            t.committed = true
                            output
                        },
                        { input(t.uri) }, expected)
                    val effective = display(t.uri)
                    return mapOf("status" to "completed", "operationId" to op, "opaqueId" to id,
                        "displayName" to effective, "confirmedBytes" to actual.bytes, "confirmedSha256" to actual.sha256)
                } catch (e: Exception) {
                    return failed(e, t.committed || t.opening || t.placeholder) +
                        mapOf("commitState" to if (t.committed) "committed" else if (t.opening) "opening" else "reserved")
                } finally { cleanupWrite() }
            }
            else -> throw IllegalArgumentException()
        }
    }
}
