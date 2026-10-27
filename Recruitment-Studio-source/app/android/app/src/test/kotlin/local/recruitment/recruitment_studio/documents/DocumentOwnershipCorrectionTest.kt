package local.recruitment.recruitment_studio.documents

import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Additive SOURCE tests. UNEXECUTED: no authenticated native toolchain grant. */
class DocumentOwnershipCorrectionTest {
    @Test fun failedOutputAcquisitionRetainsPrivateFileUntilVerifiedDeletion() {
        val custody = DocumentPrivateFileCustody(1)
        val file = java.io.File("unexecuted-private-stage")
        custody.own(file)
        assertTrue(custody.cleanup { false } is IOException)
        assertEquals(1, custody.size)
        assertNull(custody.cleanup { true })
        assertEquals(0, custody.size)
    }
    @Test fun transferCleanupRequiresTargetAsWellAsOperation() {
        assertTrue(DocumentTransferCustody.matches("op", "one", "op", "one"))
        assertFalse(DocumentTransferCustody.matches("op", "one", "op", "two"))
        assertFalse(DocumentTransferCustody.matches("op", "one", "other", "one"))
    }
    @Test fun duplicateUriReservationCannotAuthorizeDeletion() {
        val custody = DocumentUriCustody(32)
        val original = custody.claim("content://provider/one")
        try { custody.claim("content://provider/one"); fail("duplicate") }
        catch (_: DocumentCapacityException) { }
        assertTrue(custody.owns(original))
        assertEquals(1, custody.size)
        custody.release(original)
        assertEquals(0, custody.size)
    }
    @Test fun permanentDetachInvalidatesWorkerStampButRotationRetainsIt() {
        val epoch = DocumentEpochs()
        epoch.attachEngine(); epoch.attachActivity()
        val worker = epoch.capture()
        epoch.detachActivity(true)
        assertTrue(epoch.current(worker))
        epoch.attachActivity()
        assertTrue(epoch.current(worker))
        epoch.detachActivity(false)
        epoch.attachActivity()
        assertFalse(epoch.current(worker))
    }
    @Test fun engineDetachInvalidatesPreviousPickerAcrossReattach() {
        val epoch = DocumentEpochs()
        epoch.attachEngine(); epoch.attachActivity()
        val old = epoch.capture()
        epoch.detachEngine(); epoch.attachEngine(); epoch.attachActivity()
        assertFalse(epoch.current(old))
    }
    @Test fun saturatedOrdinaryQueueCannotDropShutdownBarrier() {
        val started = CountDownLatch(1); val release = CountDownLatch(1)
        var cleaned = 0
        val worker = DocumentCleanupExecutor { cleaned++; null }
        assertTrue(worker.submit { started.countDown(); release.await() })
        assertTrue(started.await(1, TimeUnit.SECONDS))
        repeat(4) { assertTrue(worker.submit { }) }
        assertFalse(worker.submit { fail("ordinary capacity must refuse") })
        val terminal = worker.requestCleanup(true)
        assertFalse(terminal.isDone)
        release.countDown()
        assertNull(terminal.get(2, TimeUnit.SECONDS))
        assertEquals(1, cleaned)
    }
    @Test fun firstReadCloseFaultCannotSkipWriteOrTargetCleanup() {
        var writes = 0; var targets = 0
        val failure = DocumentCleanupAttempts.run(
            { throw IOException("controlled read close") },
            { writes++ }, { targets++ })
        assertTrue(failure is IOException)
        assertEquals(1, writes); assertEquals(1, targets)
    }
    @Test fun cleanupFailureIsSharedAcrossTeardownCallers() {
        val fault = IOException("controlled")
        val worker = DocumentCleanupExecutor { fault }
        val first = worker.requestCleanup(true)
        val second = worker.requestCleanup(true)
        assertSame(first, second)
        assertSame(fault, first.get(2, TimeUnit.SECONDS))
    }
}
