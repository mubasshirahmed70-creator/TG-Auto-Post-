import React, { useState } from 'react';
import type { ProductItem, SchedulerConfig } from '../types.ts';

interface TelegramPreviewProps {
  products: ProductItem[];
  config: SchedulerConfig;
  senderName: string;
}

function isValidLink(url?: string): boolean {
  const trimmed = url?.trim() ?? '';
  if (!trimmed || trimmed === 'https://t.me/' || trimmed === 'http://t.me/') {
    return false;
  }
  return /^https?:\/\/.+/i.test(trimmed) || /^tg:\/\/.+/i.test(trimmed);
}

export const TelegramPreview: React.FC<TelegramPreviewProps> = ({
  products,
  config,
  senderName,
}) => {
  const activeProducts = products.filter((p) => p.active);
  const list = activeProducts.length > 0 ? activeProducts : products;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [imgErrorMap, setImgErrorMap] = useState<Record<string, boolean>>({});

  const safeIndex = list.length > 0 ? selectedIndex % list.length : 0;
  const product = list[safeIndex];

  if (!product) {
    return (
      <div className="ui-card h-full flex flex-col items-center justify-center text-center p-6 min-h-[380px] mb-0">
        <div
          className="ui-stat-ico mb-3"
          style={
            {
              '--accent': '#0284c7',
              '--accent-soft': '#f0f9ff',
              '--accent-border': '#bae6fd',
            } as React.CSSProperties
          }
        >
          <i className="ri-send-plane-fill" />
        </div>
        <p className="text-[13px] font-extrabold text-[#0f172a]">প্রিভিউ দেখার মতো কোনো পোস্ট নেই</p>
        <p className="text-[11.5px] text-[#475569] mt-1">
          নতুন পোস্ট যোগ করলে টেলিগ্রাম গ্রুপে কেমন দেখাবে তা এখানে দেখা যাবে।
        </p>
      </div>
    );
  }

  const primaryImage = product.images[0];
  const effectiveLink = isValidLink(product.link)
    ? product.link!.trim()
    : isValidLink(config.sellerContactUrl)
    ? config.sellerContactUrl.trim()
    : '';

  const isUserbotMode = config.postingMode === 'userbot';

  return (
    <div className="ui-card flex flex-col h-full mb-0">
      <div className="ui-card-head">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="ui-drawer-ico"
            style={
              {
                '--accent': '#0284c7',
                '--accent-soft': '#f0f9ff',
                '--accent-border': '#bae6fd',
              } as React.CSSProperties
            }
          >
            <i className="ri-telegram-fill" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate">টেলিগ্রাম গ্রুপ প্রিভিউ</h3>
            <p className="text-[10.5px] text-[#475569] font-medium truncate">
              {isUserbotMode
                ? 'পার্সোনাল অ্যাকাউন্ট মোডে যেমন দেখাবে'
                : 'অফিশিয়াল বট মোডে যেমন দেখাবে'}
            </p>
          </div>
        </div>

        {list.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedIndex((prev) => (prev - 1 + list.length) % list.length)}
              className="ui-btn ui-btn-ghost px-2 py-1"
              aria-label="Previous post preview"
            >
              <i className="ri-arrow-left-s-line text-sm" />
            </button>
            <span className="text-[11px] font-bold text-[#475569] ui-mono px-1.5">
              {safeIndex + 1}/{list.length}
            </span>
            <button
              type="button"
              onClick={() => setSelectedIndex((prev) => (prev + 1) % list.length)}
              className="ui-btn ui-btn-ghost px-2 py-1"
              aria-label="Next post preview"
            >
              <i className="ri-arrow-right-s-line text-sm" />
            </button>
          </div>
        )}
      </div>

      <div className="ui-card-body flex-1 bg-[#f8fafc] flex flex-col justify-center">
        <div className="max-w-md w-full mx-auto">
          <div className="bg-white border border-[#e2e8f0] rounded-[12px] overflow-hidden shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
            <div className="px-3 py-2 border-b border-[#f1f5f9] flex items-center justify-between text-[11px]">
              <span className="font-extrabold text-[#2563eb] flex items-center gap-1.5 truncate">
                <i className="ri-user-3-fill text-xs" />
                {senderName}
              </span>
              <span className="ui-badge ui-badge-neutral">
                {isUserbotMode ? 'Account' : 'Bot'}
              </span>
            </div>

            {primaryImage && !imgErrorMap[primaryImage] && (
              <div className="relative bg-[#f1f5f9] aspect-[4/3] w-full overflow-hidden">
                <img
                  src={primaryImage}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  onError={() => setImgErrorMap((prev) => ({ ...prev, [primaryImage]: true }))}
                  className="w-full h-full object-cover"
                />
                {product.images.length > 1 && (
                  <div className="absolute bottom-2 right-2 bg-[#0f172a]/80 text-white text-[10.5px] font-bold px-2 py-0.5 rounded-[6px] tabular-nums flex items-center gap-1">
                    <i className="ri-gallery-fill text-[11px]" />+{product.images.length - 1} ছবি
                  </div>
                )}
              </div>
            )}

            <div className="p-3 space-y-1.5 leading-relaxed">
              {product.caption && (
                <p className="text-[12.5px] text-[#0f172a] whitespace-pre-line break-words">
                  {product.caption}
                </p>
              )}

              {isUserbotMode && effectiveLink && (
                <p className="text-[11.5px] text-[#2563eb] font-semibold pt-1 break-all flex items-center gap-1.5">
                  <i className="ri-links-line shrink-0" />
                  <span>{effectiveLink}</span>
                </p>
              )}

              <div className="flex justify-end pt-0.5">
                <span className="text-[10px] text-[#94a3b8] ui-mono">12:30 PM</span>
              </div>
            </div>
          </div>

          {!isUserbotMode && effectiveLink && product.images.length <= 1 && (
            <a
              href={effectiveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 ui-btn ui-btn-dark w-full py-2 justify-center"
            >
              <span>{config.buttonText.trim() || 'অর্ডার করতে মেসেজ দিন'}</span>
              <i className="ri-external-link-line" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
