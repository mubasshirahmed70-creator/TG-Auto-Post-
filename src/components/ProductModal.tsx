import React, { useState, useRef } from 'react';
import type { ProductItem } from '../types.ts';
import { withBase } from '../basePath.ts';

interface ProductModalProps {
  initialProduct: ProductItem | null;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    name?: string;
    caption: string;
    link?: string;
    images: string[];
    active: boolean;
  }) => Promise<void>;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  initialProduct,
  onClose,
  onSave,
}) => {
  const [caption, setCaption] = useState(initialProduct?.caption ?? '');
  const [link, setLink] = useState(initialProduct?.link ?? '');
  const [images, setImages] = useState<string[]>(initialProduct?.images ?? []);
  const [active, setActive] = useState(initialProduct?.active ?? true);
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    const remainingSlots = Math.max(0, 5 - images.length);
    const chosen = Array.from(files).slice(0, remainingSlots);

    const readAsDataUrl = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
          reject(new Error('শুধুমাত্র ছবি ফাইল (JPG/PNG/WEBP) আপলোড করা যাবে'));
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          reject(new Error('প্রতিটি ছবির সাইজ ৫ এমবি-এর কম হতে হবে'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('ছবি রিড করতে সমস্যা হয়েছে'));
        reader.readAsDataURL(file);
      });

    try {
      const results = await Promise.all(chosen.map(readAsDataUrl));
      setImages((prev) => [...prev, ...results]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ছবি আপলোড ব্যর্থ হয়েছে');
    }
  };

  const handleAddImageUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setError('সঠিক Image URL দিন (https://... দিয়ে শুরু)');
      return;
    }
    if (images.length >= 5) {
      setError('সর্বোচ্চ ৫টি ছবি যুক্ত করা যাবে');
      return;
    }
    setError(null);
    setImages((prev) => [...prev, trimmed]);
    setUrlInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption.trim() && !link.trim() && images.length === 0) {
      setError('পোস্টের লেখা, লিংক অথবা ছবি — অন্তত একটি দিন');
      return;
    }
    if (link.trim() && !/^https?:\/\/.+/i.test(link.trim()) && !/^tg:\/\/.+/i.test(link.trim())) {
      setError('লিংকটি https:// বা http:// দিয়ে শুরু হতে হবে');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: initialProduct?.id,
        caption: caption.trim(),
        link: link.trim() || undefined,
        images,
        active,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সেভ করতে সমস্যা হয়েছে');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ui-modal-ov show" role="dialog" aria-modal="true">
      <div className="ui-modal ui-modal-wide">
        <div className="ui-modal-head">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="ui-drawer-ico"
              style={
                {
                  '--accent': '#7c3aed',
                  '--accent-soft': '#f5f3ff',
                  '--accent-border': '#ddd6fe',
                } as React.CSSProperties
              }
            >
              <i className="ri-edit-box-fill" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate">
                {initialProduct ? 'পোস্ট এডিট করুন' : 'নতুন টেলিগ্রাম পোস্ট তৈরি করুন'}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium truncate">
                লেখা, লিংক বা চাইলে ছবি দিন (ছবি দেওয়া বাধ্যতামূলক নয়)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ui-btn ui-btn-ghost px-2 py-1.5"
            aria-label="Close modal"
          >
            <i className="ri-close-line text-sm" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-2.5 rounded-[9px] bg-[#fff1f2] border border-[#fecdd3] text-[11.5px] font-semibold text-[#e11d48] flex items-center gap-2">
              <i className="ri-error-warning-fill text-sm shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Photos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10.5px] font-bold text-[#475569] uppercase tracking-wider">
                ১. ছবি যোগ করুন (ঐচ্ছিক — সর্বোচ্চ ৫টি)
              </span>
              <span className="ui-badge ui-badge-info tabular-nums">{images.length} / 5</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-2.5">
              {images.map((img, idx) => (
                <div
                  key={`${img.slice(0, 24)}-${idx}`}
                  className="relative aspect-[4/3] rounded-[10px] border border-[#e2e8f0] overflow-hidden bg-[#f8fafc] group"
                >
                  <img
                    src={withBase(img)}
                    alt={`Post ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-[7px] bg-[#0f172a]/80 text-white hover:bg-[#e11d48] flex items-center justify-center transition-colors"
                    aria-label="Remove image"
                  >
                    <i className="ri-delete-bin-6-line text-xs" />
                  </button>
                </div>
              ))}

              {images.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-[4/3] rounded-[10px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] hover:border-[#2563eb] hover:bg-[#eff6ff] flex flex-col items-center justify-center gap-1 text-[#475569] hover:text-[#2563eb] transition-colors cursor-pointer"
                >
                  <i className="ri-image-add-line text-lg" />
                  <span className="text-[10.5px] font-bold">ছবি আপলোড</span>
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
            />

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <i className="ri-links-line text-sm text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="অথবা ছবির URL দিন (https://...)"
                  className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-[#cbd5e1] rounded-[8px] bg-white text-[#0f172a] focus:outline-none focus:border-[#2563eb] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]"
                />
              </div>
              <button
                type="button"
                onClick={handleAddImageUrl}
                className="ui-btn ui-btn-outline shrink-0"
              >
                <i className="ri-upload-2-line" />
                যোগ করুন
              </button>
            </div>
          </div>

          {/* Text / Caption */}
          <div className="ui-field mb-0">
            <label htmlFor="post-caption">২. পোস্টের লেখা</label>
            <textarea
              id="post-caption"
              rows={5}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="আপনার প্রোডাক্টের নাম, দাম, অফার বা যা লিখতে চান এখানে লিখুন..."
              className="leading-relaxed"
            />
          </div>

          {/* Link */}
          <div className="ui-field mb-0">
            <label htmlFor="post-link">৩. লিংক (ঐচ্ছিক — অর্ডার বা ইনবক্স লিংক)</label>
            <div className="relative">
              <i className="ri-links-line text-sm text-[#94a3b8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="post-link"
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://t.me/your_username বা প্রোডাক্ট লিংক"
                style={{ paddingLeft: '30px' }}
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none p-2.5 rounded-[10px] bg-[#f8fafc] border border-[#e2e8f0]">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 rounded border-[#cbd5e1] text-[#2563eb] focus:ring-[#2563eb]"
            />
            <span className="text-[12px] font-bold text-[#1e293b]">
              অটো-পোস্ট কিউ-তে চালু রাখুন
            </span>
          </label>

          <div className="pt-3 border-t border-[#f1f5f9] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="ui-btn ui-btn-outline"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={saving}
              className="ui-btn ui-btn-primary"
            >
              <i className={saving ? 'ri-loader-4-line animate-spin' : 'ri-check-line'} />
              {saving ? 'সেভ হচ্ছে...' : 'পোস্ট সেভ করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
