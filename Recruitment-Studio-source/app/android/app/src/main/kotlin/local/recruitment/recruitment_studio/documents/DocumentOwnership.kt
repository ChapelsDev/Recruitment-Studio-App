package local.recruitment.recruitment_studio.documents

import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Semaphore
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.RejectedExecutionException

/** All helpers are used by the real plugin, not test-only parallel models. */
internal class DocumentUriCustody(private val maximum: Int) {
    internal class Lease internal constructor(val uri: String)
    private val owners = LinkedHashMap<String, Lease>()
    val size: Int get() = owners.size
    fun claim(uri: String): Lease {
        if (owners.size >= maximum || owners.containsKey(uri)) throw DocumentCapacityException()
        return Lease(uri).also { owners[uri] = it }
    }
    fun owns(lease: Lease) = owners[lease.uri] === lease
    fun release(lease: Lease) { if (owns(lease)) owners.remove(lease.uri) }
}
/** Private cache-file ownership before FileOutputStream acquisition succeeds. */
internal class DocumentPrivateFileCustody(private val maximum: Int) {
    private val files = LinkedHashSet<java.io.File>()
    val size: Int get() = files.size
    fun own(file: java.io.File) {
        if (files.size >= maximum) throw DocumentCapacityException()
        files.add(file)
    }
    fun transfer(file: java.io.File) { files.remove(file) }
    fun cleanup(delete: (java.io.File) -> Boolean): Exception? {
        var failure: Exception? = null
        val iterator = files.iterator()
        while (iterator.hasNext()) {
            val file = iterator.next()
            try {
                if (!delete(file)) throw java.io.IOException("Unresolved private staging")
                iterator.remove()
            } catch (e: Exception) { if (failure == null) failure = e }
        }
        return failure
    }
}
internal object DocumentTransferCustody {
    fun matches(actualOperation: String, actualTarget: String,
                requestedOperation: String, requestedTarget: String) =
        actualOperation == requestedOperation && actualTarget == requestedTarget
}
internal data class DocumentEpoch(val engine: Long, val activity: Long)
internal class DocumentEpochs {
    private var engine = 0L; private var activity = 0L
    private var engineLive = false; private var activityLive = false
    fun attachEngine() { engine++; engineLive = true }
    fun attachActivity() { activityLive = true }
    fun detachEngine() { engineLive = false; activityLive = false; engine++; activity++ }
    fun detachActivity(rotation: Boolean) { if (!rotation) { activityLive = false; activity++ } }
    fun capture() = DocumentEpoch(engine, activity)
    fun current(stamp: DocumentEpoch) = engineLive && activityLive && stamp == capture()
    fun live() = engineLive && activityLive
}
internal object DocumentCleanupAttempts {
    fun run(vararg attempts: () -> Unit): Exception? {
        var failure: Exception? = null
        attempts.forEach { try { it() } catch (e: Exception) { if (failure == null) failure = e } }
        return failure
    }
}
/** Four ordinary queued jobs plus one RESERVED cleanup slot. Ordinary permits
 * cover active+queued (5), so ordinary work can never consume the sixth slot.
 * The termination hook is a second, non-admission-dependent cleanup barrier.
 */
internal class DocumentCleanupExecutor(private val cleanup: () -> Exception?) {
    private val permits = Semaphore(5)
    private val gate = Any()
    private var terminal: CompletableFuture<Exception?>? = null
    private val worker = object : ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, ArrayBlockingQueue<Runnable>(5)) {
        override fun terminated() {
            try { synchronized(gate) { terminal?.let { if (!it.isDone) it.complete(cleanup()) } } }
            finally { super.terminated() }
        }
    }
    fun settlement(): CompletableFuture<Exception?>? = synchronized(gate) { terminal }
    fun submit(task: () -> Unit): Boolean {
        synchronized(gate) {
            if (terminal != null || !permits.tryAcquire()) return false
            try { worker.execute { try { task() } finally { permits.release() } }; return true }
            catch (_: RejectedExecutionException) { permits.release(); return false }
        }
    }
    fun requestCleanup(shutdown: Boolean): CompletableFuture<Exception?> = synchronized(gate) {
        val existing = terminal
        if (existing != null) {
            if (shutdown) worker.shutdown()
            return@synchronized existing
        }
        val result = CompletableFuture<Exception?>(); terminal = result
        try { worker.execute {
            val failure = try { cleanup() } catch (e: Exception) { e }
            result.complete(failure)
        } } catch (e: RejectedExecutionException) {
            // Never erase custody or publish a successful cleanup here. The
            // termination hook drains if shutdown is in progress; otherwise the
            // failed shared terminal is the truthful unresolved diagnostic.
            if (worker.isTerminated) result.complete(e)
        }
        if (shutdown) worker.shutdown()
        result
    }
    // Rotation does not request teardown. A new permanent activity lifetime can
    // reopen ordinary admission only after the previous truthful barrier settled.
    fun resume(): Boolean = synchronized(gate) {
        val old = terminal
        if (worker.isShutdown || old?.isDone == false || old?.getNow(null) != null) false
        else { terminal = null; true }
    }
}
