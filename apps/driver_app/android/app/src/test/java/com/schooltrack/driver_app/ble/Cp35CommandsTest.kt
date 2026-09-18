package com.schooltrack.driver_app.ble

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class Cp35CommandsTest {
    @Test
    fun txIndex_mapsMinus19_5ToZero() {
        assertEquals(0, Cp35Commands.txIndexFromDbm(-19.5))
        assertEquals(0, Cp35Commands.txIndexFromDbm(-20.0))
    }

    @Test
    fun intervalIndex_maps400msTo4() {
        assertEquals(4, Cp35Commands.intervalIndexFromMs(400))
        assertEquals(8, Cp35Commands.intervalIndexFromMs(800))
    }

    @Test
    fun setIBeaconUuid_packs16Bytes() {
        val frame = Cp35Commands.setIBeaconUuid("A1B2C3D4-E5F6-4789-A012-3456789ABCDE")
        assertEquals(0x74.toByte(), frame[2])
        assertEquals(16, frame[3].toInt() and 0xFF)
        assertTrue(Cp35FrameCodec.check(frame))
        val expectedUuid = byteArrayOf(
            0xA1.toByte(), 0xB2.toByte(), 0xC3.toByte(), 0xD4.toByte(),
            0xE5.toByte(), 0xF6.toByte(), 0x47, 0x89.toByte(),
            0xA0.toByte(), 0x12, 0x34, 0x56, 0x78, 0x9A.toByte(), 0xBC.toByte(), 0xDE.toByte(),
        )
        assertArrayEquals(expectedUuid, frame.copyOfRange(4, 20))
    }

    @Test
    fun setMajorMinor_bigEndian() {
        val major = Cp35Commands.setIBeaconMajor(0x0102)
        assertArrayEquals(byteArrayOf(0x01, 0x02), major.copyOfRange(4, 6))
        val minor = Cp35Commands.setIBeaconMinor(7)
        assertArrayEquals(byteArrayOf(0x00, 0x07), minor.copyOfRange(4, 6))
    }

    @Test
    fun setPassword_andSave_goldenOpcodes() {
        val pwd = Cp35Commands.setDevicePassword("AB12CD")
        assertEquals(0x24.toByte(), pwd[2])
        assertEquals(6, pwd[3].toInt() and 0xFF)
        assertArrayEquals("AB12CD".toByteArray(Charsets.UTF_8), pwd.copyOfRange(4, 10))

        val save = Cp35Commands.saveConfig()
        assertEquals(0x60.toByte(), save[2])
    }

    @Test
    fun writeIBeaconSequence_includesTxIntervalTrigger() {
        val seq = Cp35Commands.writeIBeaconSequence(
            uuid = "A1B2C3D4E5F64789A0123456789ABCDE",
            major = 1,
            minor = 2,
            txDbm = -19.5,
            intervalMs = 400,
        )
        assertEquals(6, seq.size)
        assertEquals(0x74.toByte(), seq[0][2])
        assertEquals(0x75.toByte(), seq[1][2])
        assertEquals(0x76.toByte(), seq[2][2])
        assertEquals(0x78.toByte(), seq[3][2])
        assertEquals(4.toByte(), seq[3][4])
        assertEquals(0x79.toByte(), seq[4][2])
        assertEquals(0.toByte(), seq[4][4])
        assertEquals(0xA0.toByte(), seq[5][2])
    }
}
