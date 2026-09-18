package com.schooltrack.driver_app.ble

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Cp35FrameCodecTest {
    @Test
    fun pack_emptyPayload_xorMatchesVendorShape() {
        // saveConfig 0x60 null → 4E 4F 60 00 60
        val frame = Cp35FrameCodec.pack(0x60.toByte(), null)
        assertArrayEquals(
            byteArrayOf(0x4E, 0x4F, 0x60, 0x00, 0x60),
            frame,
        )
        assertTrue(Cp35FrameCodec.check(frame))
    }

    @Test
    fun pack_withPayload_roundTripsCheck() {
        val payload = byteArrayOf(0x01, 0x02)
        val frame = Cp35FrameCodec.pack(0x75.toByte(), payload)
        assertTrue(Cp35FrameCodec.check(frame))
        val unwrapped = Cp35FrameCodec.unwrap(frame)!!
        assertEquals(0x75.toByte(), unwrapped.first)
        assertArrayEquals(payload, unwrapped.second)
    }

    @Test
    fun check_rejectsCorruptXor() {
        val frame = Cp35FrameCodec.pack(0x24.toByte(), "DX1234".toByteArray(Charsets.UTF_8))
        frame[frame.lastIndex] = (frame.last().toInt() xor 0xFF).toByte()
        assertFalse(Cp35FrameCodec.check(frame))
    }
}
