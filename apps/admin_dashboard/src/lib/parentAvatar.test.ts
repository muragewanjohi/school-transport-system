import { describe, expect, it } from "vitest";
import {
  avatarObjectPath,
  decodeImageBase64,
  looksLikeImage,
  withGuardianAvatarUrl,
} from "@/lib/parentAvatar";

function jpegBytes(): Buffer {
  const buf = Buffer.alloc(64, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

describe("parentAvatar helpers", () => {
  it("Given a JPEG payload, When decoded, Then bytes pass the image check", () => {
    const encoded = jpegBytes().toString("base64");
    const decoded = decodeImageBase64(encoded);
    expect(decoded).not.toBeNull();
    expect(looksLikeImage(decoded as Buffer)).toBe(true);
  });

  it("Given a data-URL JPEG, When decoded, Then the prefix is stripped", () => {
    const encoded = `data:image/jpeg;base64,${jpegBytes().toString("base64")}`;
    expect(decodeImageBase64(encoded)?.length).toBe(64);
  });

  it("Given random text, When decoded, Then the image is rejected", () => {
    expect(decodeImageBase64(Buffer.from("not-an-image-at-all-pad-pad-pad").toString("base64"))).toBeNull();
  });

  it("Given HEIC bytes, When decoded, Then the image is rejected until the client re-encodes", () => {
    const heic = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(looksLikeImage(heic)).toBe(false);
    expect(decodeImageBase64(heic.toString("base64"))).toBeNull();
  });

  it("Given owner id, When building a storage path, Then the first folder is the uid", () => {
    expect(avatarObjectPath("aaaa-bbbb", "students", "student-1", 1000)).toBe(
      "aaaa-bbbb/students_student-1_1000.jpg"
    );
  });

  it("Given guardians JSON, When setting an avatar, Then only the matching phone is updated", () => {
    const updated = withGuardianAvatarUrl({
      guardians: [
        { name: "Parent", phone: "+254700000001" },
        { name: "Aunt", phone: "0700 111 222" },
      ],
      guardianPhone: "+254700111222",
      avatarUrl: "https://cdn/avatar.jpg",
    });
    expect(updated[0]?.avatar_url).toBeUndefined();
    expect(updated[1]?.avatar_url).toBe("https://cdn/avatar.jpg");
  });
});
