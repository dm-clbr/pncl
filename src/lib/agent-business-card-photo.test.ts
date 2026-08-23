import {
  BUSINESS_CARD_PHOTO_INPUT_TYPES,
  isOwnProfilePhotoPath,
  loadOwnProfilePhotoForBusinessCard,
} from "@/lib/agent-business-card-photo";
import type { AgentBusinessCardPhoto } from "@/lib/agent-business-card-pdf";

const PROFILE_INPUT = {
  userId: "agent-1",
  profilePhotoPath: "agent-1/avatar.jpg",
  profileUpdatedAt: "2026-08-24T00:00:00.000Z",
};
const CONVERTED_PHOTO: AgentBusinessCardPhoto = {
  pngBytes: new Uint8Array([137, 80, 78, 71]),
};

function photoResponse(type: string) {
  return {
    ok: true,
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type }),
  } as Response;
}

describe("agent business-card profile photo", () => {
  it("accepts only the signed-in agent's avatar path", () => {
    expect(isOwnProfilePhotoPath("agent-1", "agent-1/avatar.jpg")).toBe(true);
    expect(isOwnProfilePhotoPath("agent-1", "agent-1/avatar.png")).toBe(true);
    expect(isOwnProfilePhotoPath("agent-1", "agent-1/avatar.webp")).toBe(true);
    expect(isOwnProfilePhotoPath("agent-1", "agent-2/avatar.jpg")).toBe(false);
    expect(isOwnProfilePhotoPath("agent-1", "agent-1/private/avatar.jpg")).toBe(false);
    expect(isOwnProfilePhotoPath("agent-1", "agent-1/../agent-2/avatar.jpg")).toBe(false);
  });

  it.each(BUSINESS_CARD_PHOTO_INPUT_TYPES)("normalizes supported %s photos for PDF embedding", async (type) => {
    const fetchPhoto = vi.fn().mockResolvedValue(photoResponse(type));
    const getPhotoUrl = vi.fn().mockReturnValue("https://storage.example/agent-1/avatar");
    const convertPhoto = vi.fn().mockResolvedValue(CONVERTED_PHOTO);

    await expect(loadOwnProfilePhotoForBusinessCard(PROFILE_INPUT, {
      fetchPhoto,
      getPhotoUrl,
      convertPhoto,
    })).resolves.toEqual(CONVERTED_PHOTO);
    expect(getPhotoUrl).toHaveBeenCalledWith(PROFILE_INPUT.profilePhotoPath, PROFILE_INPUT.profileUpdatedAt);
    expect(convertPhoto).toHaveBeenCalledWith(expect.objectContaining({ type }));
  });

  it("returns the branded fallback path for an unsafe, missing, or undecodable photo", async () => {
    const fetchPhoto = vi.fn();
    const convertPhoto = vi.fn();

    await expect(loadOwnProfilePhotoForBusinessCard({
      ...PROFILE_INPUT,
      profilePhotoPath: "agent-2/avatar.jpg",
    }, { fetchPhoto, convertPhoto })).resolves.toBeNull();
    expect(fetchPhoto).not.toHaveBeenCalled();

    fetchPhoto.mockResolvedValueOnce(photoResponse("image/gif"));
    await expect(loadOwnProfilePhotoForBusinessCard(PROFILE_INPUT, {
      fetchPhoto,
      getPhotoUrl: () => "https://storage.example/agent-1/avatar.gif",
      convertPhoto,
    })).resolves.toBeNull();
    expect(convertPhoto).not.toHaveBeenCalled();

    fetchPhoto.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(loadOwnProfilePhotoForBusinessCard(PROFILE_INPUT, {
      fetchPhoto,
      getPhotoUrl: () => "https://storage.example/agent-1/avatar.jpg",
      convertPhoto,
    })).resolves.toBeNull();
  });
});
