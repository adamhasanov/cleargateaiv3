"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { ACCEPTED_FORMATS, isAcceptedFileName, MAX_FILE_BYTES } from "@/lib/config/documents";
import { DOCUMENT_IDS, type DocumentId } from "@/lib/engine/types";
import { AlertCircleIcon, AlertIcon, ArrowRightIcon, CheckCircleIcon, FileIcon, InfoIcon, LayersIcon, RefreshIcon, TrashIcon, UploadIcon } from "../Icons";

import { SampleScenarios } from "./SampleScenarios";

export type Slots = Record<DocumentId, File | null>;

const FORMAT_LABELS = ACCEPTED_FORMATS.map((f) => f.label).join(", ");
const ACCEPT_ATTR = ACCEPTED_FORMATS.flatMap((f) => [f.mime, ...f.extensions]).join(",");
const SIZE_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024));

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadSlot({
  doc, file, onFile, onRemove,
}: { doc: DocumentId; file: File | null; onFile: (f: File) => string | null; onRemove: () => void }) {
  const { dict } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const errorId = useId();

  const accept = (f: File | undefined) => {
    if (!f) return;
    setError(onFile(f));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={`slot ${file ? "slot--filled" : ""} ${error ? "slot--error" : ""} ${dragging ? "slot--drag" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="slot__icon">{file ? <CheckCircleIcon size={26} /> : <FileIcon size={26} />}</div>
      <h2 className="slot__title">{dict.documents[doc]}</h2>
      <p className="slot__formats">{format(dict.upload.formats, { formats: FORMAT_LABELS, size: SIZE_MB })}</p>

      {file ? (
        <p className="slot__file" title={file.name}>
          <span className="slot__filename">{file.name}</span>
          <span className="slot__filesize">{formatBytes(file.size)}</span>
        </p>
      ) : (
        <p className="slot__empty">{dict.upload.empty}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        className="visually-hidden"
        accept={ACCEPT_ATTR}
        aria-label={`${dict.documents[doc]} — ${dict.upload.choose}`}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="slot__actions">
        {file ? (
          <>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => inputRef.current?.click()}>
              <RefreshIcon size={16} />
              {dict.upload.replace}
            </button>
            <button
              type="button"
              className="btn btn--text btn--sm"
              onClick={() => {
                setError(null);
                onRemove();
              }}
            >
              <TrashIcon size={16} />
              {dict.upload.remove}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--outline btn--sm" onClick={() => inputRef.current?.click()}>
            <UploadIcon size={16} />
            {dict.upload.choose}
          </button>
        )}
      </div>
      {!file && <p className="slot__hint">{dict.upload.dropHint}</p>}
      {error && (
        <p className="slot__error" id={errorId} role="alert">
          <AlertCircleIcon size={16} />
          {error}
        </p>
      )}
    </div>
  );
}

export function UploadView({
  slots, onChange, onStart, configured, sampleEnabled, onSample,
}: {
  slots: Slots;
  onChange: (s: Slots) => void;
  onStart: () => void;
  configured: boolean | null;
  sampleEnabled: boolean;
  onSample: () => void;
}) {
  const { dict } = useI18n();
  const missing = DOCUMENT_IDS.filter((d) => !slots[d]).length;
  const canStart = missing === 0 && configured !== false;

  const setFile = (doc: DocumentId) => (f: File): string | null => {
    if (!isAcceptedFileName(f.name, f.type)) return format(dict.upload.errorFormat, { formats: FORMAT_LABELS });
    if (f.size > MAX_FILE_BYTES) return format(dict.upload.errorSize, { size: SIZE_MB });
    if (f.size === 0) return dict.upload.errorEmpty;
    onChange({ ...slots, [doc]: f });
    return null;
  };

  return (
    <section aria-labelledby="upload-title">
      <h1 id="upload-title" className="page-title">{dict.upload.title}</h1>
      <p className="page-subtitle">{dict.upload.subtitle}</p>

      {configured === false && (
        <div className="notice notice--warning" role="status">
          <AlertIcon size={22} />
          <div>
            <p className="notice__title">{dict.upload.notConfiguredTitle}</p>
            <p>{dict.upload.notConfiguredText}</p>
          </div>
        </div>
      )}

      <div className="slots">
        {DOCUMENT_IDS.map((doc) => (
          <UploadSlot
            key={doc}
            doc={doc}
            file={slots[doc]}
            onFile={setFile(doc)}
            onRemove={() => onChange({ ...slots, [doc]: null })}
          />
        ))}
      </div>

      <div className="upload-footer">
        <p className="upload-footer__privacy">
          <InfoIcon size={18} />
          <span>{dict.upload.privacyNote}</span>
        </p>
        <div className="upload-footer__start">
          {missing > 0 && (
            <p className="upload-footer__hint" id="start-hint">
              {dict.upload.startHint} {format(dict.upload.missingCount, { count: missing })}
            </p>
          )}
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={!canStart}
            aria-describedby={missing > 0 ? "start-hint" : undefined}
            onClick={onStart}
          >
            {dict.upload.start}
            <ArrowRightIcon size={18} />
          </button>
        </div>
      </div>

      <SampleScenarios onLoad={onChange} />

      {sampleEnabled && (
        <div className="sample-card">
          <LayersIcon size={22} />
          <div className="sample-card__body">
            <p className="sample-card__title">{dict.upload.sampleTitle}</p>
            <p className="sample-card__text">{dict.upload.sampleText}</p>
          </div>
          <button type="button" className="btn btn--outline btn--sm" onClick={onSample}>
            {dict.upload.sampleCta}
          </button>
        </div>
      )}
    </section>
  );
}
