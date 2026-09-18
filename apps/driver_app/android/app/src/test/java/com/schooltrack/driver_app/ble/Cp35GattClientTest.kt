package com.schooltrack.driver_app.ble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Cp35GattClientTest {
    @Test
    fun happyPath_unlockWritePasswordRestart() {
        val transport = FakeCp35Transport(expectedPassword = "DX1234")
        val client = Cp35GattClient(transport, commandPauseMs = 0)

        assertTrue(client.connect("aa:bb:cc:dd:ee:ff").isSuccess)
        assertEquals("AA:BB:CC:DD:EE:FF", transport.connectedMac)
        assertTrue(client.unlock("DX1234").isSuccess)
        assertTrue(
            client.writeIBeacon(
                uuid = "A1B2C3D4-E5F6-4789-A012-3456789ABCDE",
                major = 1,
                minor = 3,
            ).isSuccess,
        )
        assertTrue(client.enableTlm().isSuccess)
        assertTrue(client.setDevicePassword("AB12CD").isSuccess)
        assertTrue(client.restart("AB12CD").isSuccess)

        assertEquals(1, transport.passwordWrites.size)
        assertTrue(transport.commands.any { it[2] == 0x74.toByte() })
        assertTrue(transport.commands.any { it[2] == 0x24.toByte() })
        assertTrue(transport.commands.any { it[2] == 0x60.toByte() })
        assertTrue(transport.commands.any { it[2] == 0x44.toByte() })
        assertEquals(1, transport.disconnectCount)
        assertFalse(client.isConnected)
    }

    @Test
    fun wrongPassword_failsUnlock() {
        val transport = FakeCp35Transport(expectedPassword = "TENANT")
        val client = Cp35GattClient(transport, commandPauseMs = 0)
        assertTrue(client.connect("11:22:33:44:55:66").isSuccess)
        val result = client.unlock("DX1234")
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is Cp35ProvisionError.AuthFailed)
        assertEquals(0, transport.commands.size)
    }

    @Test
    fun writeBeforeConnect_notConnected() {
        val client = Cp35GattClient(FakeCp35Transport(), commandPauseMs = 0)
        val result = client.writeIBeacon(
            uuid = "A1B2C3D4-E5F6-4789-A012-3456789ABCDE",
            major = 1,
            minor = 1,
        )
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is Cp35ProvisionError.NotConnected)
    }
}
