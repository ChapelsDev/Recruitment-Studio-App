package local.recruitment.recruitment_studio.documents

import android.content.Intent
import android.content.res.AssetFileDescriptor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.test.InstrumentationTestCase
import android.test.mock.MockContentProvider
import android.test.mock.MockContentResolver
import java.io.ByteArrayInputStream
import java.io.File

/** Instrumented resolver contract, not a completed system-picker campaign.
 * UNEXECUTED locally. Real provider/manual gates also require cancel, renamed
 * creation, revoked grants, moved documents, rotation and activity detach.
 */
@Suppress("DEPRECATION")
class DocumentPickerTest : InstrumentationTestCase() {
    fun testIntentUsesSafAndMinimumSessionGrants() {
        val open = DocumentIntents.open(arrayOf("image/png"))
        assertEquals(Intent.ACTION_OPEN_DOCUMENT, open.action)
        assertTrue(open.hasCategory(Intent.CATEGORY_OPENABLE))
        assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION, open.flags)
        val create = DocumentIntents.create("a.png", "image/png")
        assertEquals(Intent.ACTION_CREATE_DOCUMENT, create.action)
        assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION, create.flags)
        assertEquals(0, create.flags and Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }
    fun testResolverUriIsNeverConvertedToFilePath() {
        val root = instrumentation.targetContext.cacheDir
        val file = File.createTempFile("saf-contract-", ".bin", root)
        try {
            val resolver = MockContentResolver()
            resolver.addProvider("contract", object : MockContentProvider() {
                override fun openAssetFile(uri: Uri, mode: String): AssetFileDescriptor =
                    AssetFileDescriptor(openFile(uri, mode), 0, AssetFileDescriptor.UNKNOWN_LENGTH)
                override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
                    assertEquals("content", uri.scheme)
                    return ParcelFileDescriptor.open(file, if (mode.contains("w"))
                        ParcelFileDescriptor.MODE_WRITE_ONLY or ParcelFileDescriptor.MODE_TRUNCATE
                        else ParcelFileDescriptor.MODE_READ_ONLY)
                }
            })
            val uri = Uri.parse("content://contract/document/opaque-not-a-path")
            val expected = DocumentTransfer.digest(ByteArrayInputStream(byteArrayOf(1, 3, 5)), 3)
            val actual = DocumentTransfer.writeAndVerify(
                { ByteArrayInputStream(byteArrayOf(1, 3, 5)) },
                { resolver.openOutputStream(uri, "wt")!! },
                { resolver.openInputStream(uri)!! }, expected)
            assertTrue(expected.matches(actual))
        } finally { assertTrue(file.delete()) }
    }
}
