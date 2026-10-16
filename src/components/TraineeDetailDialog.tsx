import { useEffect, useRef, useState } from "react";
import {
  Cake,
  Droplet,
  Flag,
  GraduationCap,
  IdCard,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Phone,
  Trash2,
  Upload,
  Video as VideoIcon,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge, Button, Modal, cx } from "./ui";
import { ContactPhotoAvatar } from "./ContactPhotoAvatar";
import { TraineeCoursesPanel, TraineeLoginCard } from "./TraineeCourses";
import { PasscodeConfirmDialog } from "./PasscodeConfirmDialog";
import { useSettings } from "../lib/settings";
import { useT } from "../lib/i18n";
import { gradientFor } from "../lib/avatar";
import { externalUrl, whatsappUrl } from "../../convex/shared";
import { errorMessage, useToast } from "../lib/toast";
import { useAuthedMutation, useAuthedQuery } from "../lib/session";
import { mediaKindOf, uploadFile, useFileDrop, useUploadProgress } from "../lib/upload";

const SOCIAL_LINKS = [
  { field: "facebookUrl", label: "trainees.facebook" },
  { field: "youtubeUrl", label: "trainees.youtube" },
  { field: "twitterUrl", label: "trainees.twitter" },
  { field: "tiktokUrl", label: "trainees.tiktok" },
  { field: "linkedinUrl", label: "trainees.linkedin" },
] as const;

export function TraineeDetailDialog({
  open,
  onClose,
  traineeId,
}: {
  open: boolean;
  onClose: () => void;
  traineeId: Id<"trainees"> | null;
}) {
  const t = useT();
  const toast = useToast();
  const { fmtDateFull, fmtDateTime } = useSettings();
  const data = useAuthedQuery(api.trainees.detail, traineeId ? { id: traineeId } : "skip");
  const generateUploadUrl = useAuthedMutation(api.trainees.generateUploadUrl);
  const setPhoto = useAuthedMutation(api.trainees.setPhoto);
  const attachMedia = useAuthedMutation(api.trainees.attachMedia);
  const removeMedia = useAuthedMutation(api.trainees.removeMedia);

  const [uploading, setUploading] = useState(false);
  const uploadStatus = useUploadProgress();
  const [deletingMedia, setDeletingMedia] = useState<{ id: Id<"traineeMedia">; fileName: string } | null>(
    null,
  );
  /*
    Courses and certificates open as a page of their own, rising over the
    profile, so the profile stays about who the trainee is.
  */
  const [lessonsOpen, setLessonsOpen] = useState(false);
  useEffect(() => {
    if (!open) setLessonsOpen(false);
  }, [open, traineeId]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trainee = data?.trainee;
  const media = data?.media ?? [];

  async function handleUpload(file: File) {
    if (!traineeId) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const storageId = await uploadFile(uploadUrl, file);
      await attachMedia({ traineeId, storageId, fileName: file.name, kind: mediaKindOf(file) });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  const { dragOver, dropProps } = useFileDrop((file) => void handleUpload(file));

  const lessonsPanel =
    lessonsOpen && trainee ? (
      <TraineeCoursesPanel traineeId={trainee._id} traineeName={trainee.name} onClose={() => setLessonsOpen(false)} />
    ) : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={
        trainee ? (
          <ContactPhotoAvatar
            photoUrl={trainee.photoUrl}
            onUpload={async (file) => {
              const uploadUrl = await generateUploadUrl({});
              const storageId = await uploadFile(uploadUrl, file);
              await setPhoto({ id: trainee._id, storageId });
            }}
          />
        ) : (
          <GraduationCap size={19} />
        )
      }
      iconInteractive={Boolean(trainee)}
      gradient={trainee ? gradientFor(trainee.name) : undefined}
      title={trainee?.name ?? t("trainees.title")}
      subtitle={trainee?.phone}
      width="sm:max-w-2xl"
      stacked={lessonsPanel}
      onBack={() => setLessonsOpen(false)}
    >
      {!data ? (
        <div className="ac-skeleton h-64 bg-surface" aria-hidden />
      ) : trainee ? (
        <div className="flex flex-col gap-6 px-6 py-6">
          {/* ------------------------------------------------------- contact */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-2">
            {trainee.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone size={14} className="text-ink-3" aria-hidden />
                {trainee.phone}
              </span>
            )}
            {whatsappUrl(trainee.whatsapp ?? trainee.phone) && (
              <a
                href={whatsappUrl(trainee.whatsapp ?? trainee.phone)!}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-semibold text-good-ink hover:underline"
              >
                <MessageCircle size={14} aria-hidden />
                {t("trainees.whatsapp")}
              </a>
            )}
            {SOCIAL_LINKS.map(({ field, label }) => {
              const url = externalUrl(trainee[field]);
              if (!url) return null;
              return (
                <a
                  key={field}
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline"
                >
                  {t(label)}
                </a>
              );
            })}
          </div>

          {/* ------------------------------------------------------- family */}
          {(trainee.fatherName || trainee.motherName) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {trainee.fatherName && (
                <div className="rounded-xl border border-line bg-page px-3.5 py-3">
                  <p className="text-[11px] font-semibold text-ink-3">{t("trainees.fatherName")}</p>
                  <p className="mt-1 text-[14px] font-bold text-ink">{trainee.fatherName}</p>
                  {trainee.fatherPhone && <p className="mt-0.5 text-[12px] text-ink-3">{trainee.fatherPhone}</p>}
                </div>
              )}
              {trainee.motherName && (
                <div className="rounded-xl border border-line bg-page px-3.5 py-3">
                  <p className="text-[11px] font-semibold text-ink-3">{t("trainees.motherName")}</p>
                  <p className="mt-1 text-[14px] font-bold text-ink">{trainee.motherName}</p>
                  {trainee.motherPhone && <p className="mt-0.5 text-[12px] text-ink-3">{trainee.motherPhone}</p>}
                </div>
              )}
            </div>
          )}

          {/* ----------------------------------------------------- identity */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-2">
            {trainee.dateOfBirth && (
              <span className="inline-flex items-center gap-1.5">
                <Cake size={14} className="text-ink-3" aria-hidden />
                {fmtDateFull(trainee.dateOfBirth)}
              </span>
            )}
            {trainee.bloodGroup && (
              <span className="inline-flex items-center gap-1.5">
                <Droplet size={14} className="text-ink-3" aria-hidden />
                {trainee.bloodGroup}
              </span>
            )}
            {trainee.nationality && (
              <span className="inline-flex items-center gap-1.5">
                <Flag size={14} className="text-ink-3" aria-hidden />
                {trainee.nationality}
              </span>
            )}
            {trainee.nidNumber && (
              <span className="inline-flex items-center gap-1.5">
                <IdCard size={14} className="text-ink-3" aria-hidden />
                {trainee.nidNumber}
              </span>
            )}
            {trainee.religion && <Badge tone="accent">{trainee.religion}</Badge>}
          </div>

          {(trainee.hometown || trainee.currentAddress) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-2">
              {trainee.hometown && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} className="text-ink-3" aria-hidden />
                  {t("trainees.hometown")}: {trainee.hometown}
                </span>
              )}
              {trainee.currentAddress && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} className="text-ink-3" aria-hidden />
                  {t("trainees.currentAddress")}: {trainee.currentAddress}
                </span>
              )}
            </div>
          )}

          {trainee.note && (
            <div className="rounded-2xl border border-line bg-page p-4">
              <p className="text-[13px] leading-6 whitespace-pre-wrap text-ink-2">{trainee.note}</p>
            </div>
          )}

          {/* ------------------------------------------------------- gallery */}
          <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
                {t("trainees.gallery")}
              </p>
              <Button
                size="sm"
                variant="secondary"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} />
                {uploading ? t("vendors.uploading") : t("vendors.upload")}
              </Button>
            </div>
            {uploading && uploadStatus && (
              <div className="mb-2.5 rounded-xl border border-line bg-page p-2.5">
                <div className="flex items-center justify-between text-[11.5px] text-ink-3 mb-1.5">
                  <span>{uploadStatus.stage === "compressing" ? "Compressing media..." : "Uploading..."}</span>
                  <span className="font-semibold tabular-nums">{uploadStatus.progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-200"
                    style={{ width: `${Math.max(5, uploadStatus.progress)}%` }}
                  />
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleUpload(file);
              }}
            />
            <div
              {...dropProps}
              className={cx("rounded-xl transition-colors", dragOver && "bg-accent-soft ring-2 ring-accent")}
            >
              {media.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
                  <p className="text-[13px] text-ink-3">{t("trainees.noPhotos")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2.5 p-1 sm:grid-cols-4">
                  {media.map((m) => (
                    <div key={m._id} className="group relative overflow-hidden rounded-xl border border-line bg-page">
                      {m.url && m.kind === "image" ? (
                        <img src={m.url} alt="" className="aspect-square w-full object-cover" />
                      ) : m.url ? (
                        <video src={m.url} controls className="aspect-square w-full bg-black object-contain" />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center text-ink-3">
                          {m.kind === "video" ? <VideoIcon size={20} /> : <ImageIcon size={20} />}
                        </div>
                      )}
                      <button
                        onClick={() => setDeletingMedia({ id: m._id, fileName: m.fileName })}
                        aria-label={`${t("vendors.deleteFile")} — ${m.fileName}`}
                        className="absolute top-1.5 right-1.5 rounded-lg bg-page/90 p-1.5 text-ink-3 opacity-0 backdrop-blur-sm transition-opacity hover:text-critical group-hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                      <span className="absolute bottom-1 left-1.5 text-[10px] font-semibold text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">
                        {fmtDateTime(m.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <TraineeLoginCard traineeId={trainee._id} traineeName={trainee.name} username={trainee.username} />

          <button
            type="button"
            onClick={() => setLessonsOpen(true)}
            className={cx(
              "ac-glow group flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3.5",
              "border-accent/40 bg-accent-soft/40 text-[13.5px] font-medium tracking-wide text-ink-2",
              "transition-colors hover:bg-accent-soft hover:text-ink",
            )}
          >
            <GraduationCap size={16} className="text-accent transition-transform group-hover:scale-110" />
            {t("trainees.lessonsAndCertificate")}
          </button>
        </div>
      ) : null}

      <PasscodeConfirmDialog
        open={deletingMedia !== null}
        onClose={() => setDeletingMedia(null)}
        title={t("vendors.deleteFile")}
        confirmLabel={t("vendors.deleteFile")}
        body={deletingMedia ? `${deletingMedia.fileName}\n${t("vendors.deleteFileBody")}` : ""}
        onConfirm={async (passcode) => {
          if (!deletingMedia) return;
          await removeMedia({ id: deletingMedia.id, passcode });
        }}
      />
    </Modal>
  );
}
