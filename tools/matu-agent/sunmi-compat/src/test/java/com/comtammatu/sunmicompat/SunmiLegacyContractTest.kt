package com.comtammatu.sunmicompat

import org.junit.Assert.assertEquals
import org.junit.Test

class SunmiLegacyContractTest {
    @Test
    fun `matches the legacy service contract used by PrinterX`() {
        assertEquals("woyou.aidlservice.jiuiv5", SunmiLegacyContract.PACKAGE_NAME)
        assertEquals(
            "woyou.aidlservice.jiuiv5.IWoyouService",
            SunmiLegacyContract.SERVICE_ACTION
        )
        assertEquals(SunmiLegacyContract.SERVICE_ACTION, SunmiLegacyContract.SERVICE_DESCRIPTOR)
        assertEquals(11, SunmiLegacyContract.TRANSACTION_SEND_RAW_DATA)
        assertEquals(15, SunmiLegacyContract.TRANSACTION_PRINT_TEXT)
        assertEquals(18, SunmiLegacyContract.TRANSACTION_PRINT_BITMAP)
        assertEquals(29, SunmiLegacyContract.TRANSACTION_COMMIT_BUFFER_WITH_CALLBACK)
        assertEquals(33, SunmiLegacyContract.TRANSACTION_CUT_PAPER)
    }
}
