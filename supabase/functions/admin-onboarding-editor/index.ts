import { supportingFilesForFlow, validateSupportingFiles } from "../_shared/onboardingAttachments.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { requireAdmin, AdminAuthError } from "../_shared/adminAuth.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  mapPortalTodoRecord,
  validateUpsertPortalTodoPayload,
} from "../_shared/portalTodos.ts";
import {
  CONTENT_TYPES,
  canonicalStepSlug,
  inferContentType,
  siblingSlugs,
  validateVideoLink,
  validateStepLink,
  validateFlowRules,
} from "../_shared/onboardingEditorRules.ts";
import { loadFlowRules } from "../_shared/onboardingFlowRules.ts";
import { loadOnboardingContent } from "../_shared/onboardingContent.ts";
import {
  ONBOARDING_CONTENT_BUCKET,
  MAX_ICA_BYTES,
  MAX_VIDEO_BYTES,
} from "../_shared/onboardingContentRules.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (!["GET", "POST"].includes(req.method))
    return errorResponse("Method not allowed", 405);
  try {
    const { adminClient: client, user } = await requireAdmin(req);
    const { data: bucket, error: bucketError } = await client.storage.getBucket(
      ONBOARDING_CONTENT_BUCKET,
    );
    if (bucketError)
      throw new Error(
        "Upload storage is not configured. Apply the onboarding migrations.",
      );
    const configuredLimit = Number(
      Deno.env.get("ONBOARDING_UPLOAD_MAX_BYTES") || MAX_VIDEO_BYTES,
    );
    const videoLimit = Math.min(
      MAX_VIDEO_BYTES,
      bucket.file_size_limit || MAX_VIDEO_BYTES,
      configuredLimit,
    );
    if (!Number.isFinite(videoLimit) || videoLimit <= 0)
      throw new Error("Invalid upload size configuration.");
    const limits = {
      video: videoLimit,
      document: Math.min(MAX_ICA_BYTES, videoLimit),
    };
    if (
      req.method === "POST" &&
      req.headers.get("content-type")?.startsWith("multipart/form-data")
    ) {
      const form = await req.formData();
      const file = form.get("file");
      const designation = form.get("designation");
      const kind = form.get("kind");
      if (
        !(file instanceof File) ||
        !["loa", "ibo"].includes(String(designation)) ||
        !["ica", "welcome_video", "surelc_video", "video", "document"].includes(
          String(kind),
        )
      )
        throw new Error("Choose a file and valid flow.");
      const video = String(kind).includes("video");
      const allowed: Record<string, string> = video
        ? { "video/mp4": "mp4", "video/webm": "webm" }
        : kind === "ica"
          ? { "application/pdf": "pdf" }
          : {
              "application/pdf": "pdf",
              "application/msword": "doc",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                "docx",
            };
      const extension = allowed[file.type];
      if (
        !extension ||
        file.size <= 0 ||
        file.size > (video ? limits.video : limits.document)
      )
        throw new Error("The file type or size is not supported.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const prefix = new TextDecoder().decode(bytes.slice(0, 5));
      if (extension === "pdf") {
        if (prefix !== "%PDF-") throw new Error("This file is not a PDF.");
        const pdf = await PDFDocument.load(bytes);
        if (
          kind === "ica" &&
          (pdf.getPageCount() < 1 || pdf.getPageCount() > 100)
        )
          throw new Error("ICA documents must contain 1–100 pages.");
      }
      if (
        extension === "mp4" &&
        new TextDecoder().decode(bytes.slice(4, 8)) !== "ftyp"
      )
        throw new Error("Invalid MP4 file.");
      if (
        extension === "webm" &&
        ![0x1a, 0x45, 0xdf, 0xa3].every((v, i) => bytes[i] === v)
      )
        throw new Error("Invalid WebM file.");
      if (extension === "docx" && !(bytes[0] === 0x50 && bytes[1] === 0x4b))
        throw new Error("Invalid Word file.");
      if (
        extension === "doc" &&
        ![0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
          (v, i) => bytes[i] === v,
        )
      )
        throw new Error("Invalid Word file.");
      const id = crypto.randomUUID();
      const path = `${designation}/${kind}/${id}.${extension}`;
      const sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (v) => v.toString(16).padStart(2, "0"),
      ).join("");
      const { error: uploadError } = await client.storage
        .from(ONBOARDING_CONTENT_BUCKET)
        .upload(path, bytes, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const { error } = await client
        .from("onboarding_content_assets")
        .insert({
          id,
          designation,
          kind,
          path,
          filename: file.name.slice(0, 200),
          content_type: file.type,
          size_bytes: file.size,
          sha256,
          created_by: user.id,
        });
      if (error)
        throw new Error("Upload could not be registered. Please retry.");
      return jsonResponse({
        media: {
          mode: "file",
          assetId: id,
          url: client.storage.from(ONBOARDING_CONTENT_BUCKET).getPublicUrl(path)
            .data.publicUrl,
          filename: file.name,
          size: file.size,
        },
      });
    }
    const { data: records, error } = await client
      .from("portal_todos")
      .select("*")
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error(error.message);
    const all = records ?? [];
    if (req.method === "GET") {
      const [loa, ibo, loaContent, iboContent] = await Promise.all([
        loadFlowRules(client, "loa"),
        loadFlowRules(client, "ibo"),
        loadOnboardingContent(client, "loa"),
        loadOnboardingContent(client, "ibo"),
      ]);
      const rows = all
        .filter(
          (row) =>
            !Object.entries(siblingSlugs).some(
              ([main, sibling]) =>
                row.slug === sibling && all.some((item) => item.slug === main),
            ),
        )
        .map((row) => {
          const sibling = all.find(
            (item) => item.slug === siblingSlugs[row.slug],
          );
          const contentType =
            row.content_type === "system"
              ? inferContentType(row.slug)
              : row.content_type;
          const flowContent = { loa: row.flow_content?.loa, ibo: row.flow_content?.ibo };
          const key =
            contentType === "ica"
              ? "ica"
              : contentType === "welcome_video"
                ? "welcomeVideo"
                : contentType === "surelc_video"
                  ? "surelcVideo"
                  : null;
          for (const content of [loaContent, iboContent]) {
            const asset = key ? content[key] : null;
            if (!flowContent[content.designation] && asset)
              flowContent[content.designation] = {
                mode: asset.path ? "file" : "link",
                assetId: asset.path ? asset.id : undefined,
                url: asset.url,
                filename: asset.filename,
                size: asset.size_bytes,
              };
            if (
              !flowContent[content.designation] &&
              contentType.includes("video")
            ) {
              const href =
                content.designation === "ibo" && sibling
                  ? sibling.href
                  : row.href;
              if (href)
                flowContent[content.designation] = { mode: "link", url: href };
            }
          }
          return {
            ...mapPortalTodoRecord(row),
            showIbo: sibling ? sibling.show_ibo : row.show_ibo,
            contentType,
            flowContent,
            flowAttachments: {
              loa: supportingFilesForFlow(row.slug, row.flow_content?.attachments, "loa"),
              ibo: supportingFilesForFlow(row.slug, row.flow_content?.attachments, "ibo"),
            },
          };
        });
      return jsonResponse({ rows, flows: { loa, ibo }, limits, features: { supportingFiles: true } });
    }
    const body = await req.json();
    if (body.action === "saveFlow") {
      if (!["loa", "ibo"].includes(body.designation))
        throw new Error("Choose LOA or IBO.");
      const applicable = all
        .filter((row) =>
          body.designation === "loa" ? row.show_loa : row.show_ibo,
        )
        .map((row) => ({ ...row, slug: canonicalStepSlug(row.slug) }));
      const rules = validateFlowRules(body.rules, applicable);
      const { data: revision, error } = await client.rpc(
        "save_onboarding_flow_rules",
        {
          flow: body.designation,
          settings: rules,
          expected_revision: body.revision,
        },
      );
      if (error) throw new Error(error.message);
      return jsonResponse({ revision });
    }
    if (body.action !== "saveStep") throw new Error("Unknown editor action.");
    const row = body.row;
    const todo = validateUpsertPortalTodoPayload(row);
    const previous = todo.id ? all.find((item) => item.id === todo.id) : null;
    if (todo.id && !previous)
      throw new Error("Step no longer exists. Reload the page.");
    if (!CONTENT_TYPES.includes(row.contentType))
      throw new Error("Choose a content type.");
    const reserved = ["ica", "welcome_video", "surelc_video"];
    if (
      reserved.includes(row.contentType) &&
      inferContentType(previous?.slug ?? "") !== row.contentType
    )
      throw new Error(
        "Use the existing agreement or training row to edit this content.",
      );
    if (
      previous &&
      (reserved.includes(previous.content_type) ||
        previous.completion_type === "auto") &&
      row.contentType !== previous.content_type
    )
      throw new Error("The content type of a system step cannot be changed.");
    const flowContent: Record<string, unknown> = {};
    for (const designation of ["loa", "ibo"]) {
      const media = row.flowContent?.[designation];
      if (!media) continue;
      if (media.mode === "link") {
        if (row.contentType === "ica" || row.contentType === "document")
          throw new Error("Upload a document file.");
        flowContent[designation] = {
          mode: "link",
          url: row.contentType.includes("video")
            ? validateVideoLink(media.url)
            : validateStepLink(media.url),
        };
      } else if (media.mode === "file") {
        const { data: asset, error } = await client
          .from("onboarding_content_assets")
          .select("*")
          .eq("id", media.assetId)
          .eq("designation", designation)
          .eq("kind", row.contentType)
          .single();
        if (error || !asset)
          throw new Error("The selected file is not available for this flow.");
        flowContent[designation] = {
          mode: "file",
          assetId: asset.id,
          url: client.storage
            .from(ONBOARDING_CONTENT_BUCKET)
            .getPublicUrl(asset.path).data.publicUrl,
          filename: asset.filename,
          size: asset.size_bytes,
        };
      } else throw new Error("Invalid content source.");
    }
    if (
      todo.published &&
      ["video", "welcome_video", "surelc_video", "document"].includes(
        row.contentType,
      )
    ) {
      for (const designation of ["loa", "ibo"])
        if (
          (designation === "loa" ? todo.showLoa : todo.showIbo) &&
          !flowContent[designation]
        )
          throw new Error(
            `Add ${designation.toUpperCase()} content before publishing.`,
          );
    }
    const attachments = await validateSupportingFiles(
      row.flowAttachments ?? previous?.flow_content?.attachments ?? {},
      previous?.slug ?? todo.slug ?? "",
      async (id) => {
        const { data: asset, error } = await client.from("onboarding_content_assets")
          .select("id, designation, kind, path, filename, size_bytes").eq("id", id).maybeSingle();
        if (error) throw new Error("Unable to verify the supporting file. Please retry.");
        return asset ? { ...asset, url: client.storage.from(ONBOARDING_CONTENT_BUCKET).getPublicUrl(asset.path).data.publicUrl } : null;
      },
    );
    const { data: id, error: saveError } = await client.rpc(
      "save_onboarding_editor_step",
      {
        payload: {
          ...todo,
          slug: previous?.slug ?? todo.slug,
          href: validateStepLink(todo.href),
          completionType:
            previous?.completion_type ??
            (row.contentType.includes("video") ? "agent" : todo.completionType),
          autoKey: previous?.auto_key ?? todo.autoKey,
          contentType: row.contentType,
          flowContent: { ...flowContent, attachments },
          updatedAt: previous ? row.updatedAt : null,
        },
      },
    );
    if (saveError) throw new Error(saveError.message);
    return jsonResponse({ id, message: "Onboarding step saved." });
  } catch (error) {
    if (error instanceof AdminAuthError)
      return errorResponse(error.message, error.status, error.code);
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Unable to save onboarding settings.",
      400,
    );
  }
});
