package local.recruitment.recruitment_studio

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import local.recruitment.recruitment_studio.documents.DocumentBridgePlugin
import local.recruitment.recruitment_studio.bootstrap.PrivateRootBridge

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        PrivateRootBridge.register(this, flutterEngine.dartExecutor.binaryMessenger)
        if (!flutterEngine.plugins.has(DocumentBridgePlugin::class.java)) {
            flutterEngine.plugins.add(DocumentBridgePlugin())
        }
    }
}
