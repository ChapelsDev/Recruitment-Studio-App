package local.recruitment.recruitment_studio.bootstrap

import android.content.Context
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel

/** No URI, picker or credential protocol. Only this app's persistent filesDir. */
object PrivateRootBridge {
    fun register(context: Context, messenger: BinaryMessenger) {
        MethodChannel(messenger, "local.recruitment/private_runtime")
            .setMethodCallHandler { call, result ->
                if (call.method != "privateRoot" || call.arguments != null) {
                    result.notImplemented()
                } else {
                    try {
                        val root = context.filesDir.canonicalPath
                        if (root.isEmpty() || root.length > 4076) {
                            result.error("private_root_unavailable", "Private storage unavailable", null)
                        } else {
                            result.success(root)
                        }
                    } catch (_: Exception) {
                        result.error("private_root_unavailable", "Private storage unavailable", null)
                    }
                }
            }
    }
}
