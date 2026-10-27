package local.recruitment.recruitment_studio.documents

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.OutputStream
import java.security.MessageDigest
import org.junit.Assert.*
import org.junit.Test

/** JVM contract only. UNEXECUTED until the parent configures JDK/Android SDK. */
class DocumentBridgeTest {
    @Test fun actualBytesRatherThanMetadataEnforceLimit() {
        try {
            DocumentTransfer.copyBounded(ByteArrayInputStream(byteArrayOf(1, 2, 3)), ByteArrayOutputStream(), 2)
            fail("limit must refuse")
        } catch (_: DocumentCapacityException) { }
    }
    @Test fun exactLimitIsAccepted() {
        val target = ByteArrayOutputStream()
        val receipt = DocumentTransfer.copyBounded(ByteArrayInputStream(byteArrayOf(1, 2)), target, 2)
        assertEquals(2L, receipt.bytes)
        assertArrayEquals(byteArrayOf(1, 2), target.toByteArray())
    }
    @Test fun equalLengthCorruptionIsNotAConfirmedReceipt() {
        val expected = DocumentTransfer.digest(ByteArrayInputStream(byteArrayOf(1, 2)), 2)
        val actual = DocumentTransfer.digest(ByteArrayInputStream(byteArrayOf(2, 1)), 2)
        assertFalse(expected.matches(actual))
    }
    @Test fun readbackMustBeReopenedAfterOutputClose() {
        var closed = false
        val written = ByteArrayOutputStream()
        val output = object : OutputStream() {
            override fun write(b: Int) { written.write(b) }
            override fun close() { closed = true }
        }
        val expected = DocumentTransfer.digest(ByteArrayInputStream(byteArrayOf(7, 8)), 2)
        val actual = DocumentTransfer.writeAndVerify(
            { ByteArrayInputStream(byteArrayOf(7, 8)) }, { output },
            { assertTrue(closed); ByteArrayInputStream(written.toByteArray()) }, expected)
        assertTrue(expected.matches(actual))
    }
    @Test fun closeErrorPreventsSuccessAndDoesNotAttemptReadback() {
        val expected = DocumentTransfer.digest(ByteArrayInputStream(byteArrayOf(7)), 1)
        var read = false
        try {
            DocumentTransfer.writeAndVerify({ ByteArrayInputStream(byteArrayOf(7)) },
                { object : ByteArrayOutputStream() { override fun close() { throw IOException("controlled") } } },
                { read = true; ByteArrayInputStream(byteArrayOf(7)) }, expected)
            fail("close must fail")
        } catch (_: IOException) { }
        assertFalse(read)
    }
    @Test fun readPermissionLossCannotReturnCompleted() {
        val expected = DocumentTransfer.digest(ByteArrayInputStream(byteArrayOf(7)), 1)
        try {
            DocumentTransfer.writeAndVerify({ ByteArrayInputStream(byteArrayOf(7)) }, { ByteArrayOutputStream() },
                { throw SecurityException("controlled") }, expected)
            fail("permission must fail")
        } catch (_: SecurityException) { }
    }
    @Test fun hashIsActualSha256NotAnEchoedExpectation() {
        val bytes = byteArrayOf(3, 4)
        val actual = DocumentTransfer.digest(ByteArrayInputStream(bytes), 2)
        val expected = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        assertEquals(expected, actual.sha256)
    }
    @Test fun operationAndNameMustBothMatchCapability() {
        assertTrue(DocumentTransfer.authorized("op", "op", "a.png", "a.png"))
        assertFalse(DocumentTransfer.authorized("other", "op", "a.png", "a.png"))
        assertFalse(DocumentTransfer.authorized("op", "op", "b.png", "a.png"))
    }
}
