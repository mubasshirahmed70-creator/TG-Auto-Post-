import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withBase } from '../basePath.ts';

interface EditableFileInfo {
  path: string;
  label: string;
  size: number;
  modified: string;
  hasBackup: boolean;
}

interface CodeEditorPanelProps {
  authToken: string;
  onBack: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
  onUnauthorized: () => void;
}

export const CodeEditorPanel: React.FC<CodeEditorPanelProps> = ({
  authToken,
  onBack,
  onNotify,
  onUnauthorized,
}) => {
  const [files, setFiles] = useState<EditableFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [rawCode, setRawCode] = useState<string>('');
  const [fileMeta, setFileMeta] = useState<{ size: string; modified: string; hasBackup: boolean }>({
    size: '',
    modified: '',
    hasBackup: false,
  });
  const [loadingFile, setLoadingFile] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [rebuilding, setRebuilding] = useState<boolean>(false);

  // 1. Upload & Replace
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [chosenFileName, setChosenFileName] = useState<string>('');
  const [chosenFileContent, setChosenFileContent] = useState<string>('');

  // 2. 2-Step Find & Replace
  const [findText, setFindText] = useState<string>('');
  const [replaceText, setReplaceText] = useState<string>('');
  const [highlightState, setHighlightState] = useState<{
    matched: boolean;
    idx: number;
    length: number;
    lineNum: number;
    totalLines: number;
    statusType: 'ok' | 'err' | null;
    statusMsg: string;
  }>({
    matched: false,
    idx: -1,
    length: 0,
    lineNum: 0,
    totalLines: 0,
    statusType: null,
    statusMsg: '',
  });
  const markRef = useRef<HTMLElement | null>(null);

  // 3. Inline Direct Edit Toggle
  const [editMode, setEditMode] = useState<boolean>(false);
  const [draftCode, setDraftCode] = useState<string>('');

  // Confirm modal state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: (() => void) | null;
  }>({ open: false, title: '', message: '', onConfirm: null });

  const authHeaders = useCallback(
    (json = true): Record<string, string> => ({
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    }),
    [authToken]
  );

  const resetPatchState = useCallback(() => {
    setHighlightState({
      matched: false,
      idx: -1,
      length: 0,
      lineNum: 0,
      totalLines: 0,
      statusType: null,
      statusMsg: '',
    });
  }, []);

  const loadFileContent = useCallback(
    async (filename: string) => {
      if (!filename) return;
      setLoadingFile(true);
      resetPatchState();
      setEditMode(false);
      try {
        const res = await fetch(withBase('/api/editor/load'), {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({ filename }),
        });
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        const data = (await res.json()) as {
          content?: string;
          size?: string;
          modified?: string;
          hasBackup?: boolean;
          error?: string;
        };
        if (!res.ok) {
          onNotify('error', data.error ?? 'ফাইল লোড করা যায়নি');
          return;
        }
        setRawCode(data.content ?? '');
        setDraftCode(data.content ?? '');
        setFileMeta({
          size: data.size ?? '',
          modified: data.modified ?? '',
          hasBackup: Boolean(data.hasBackup),
        });
      } catch {
        onNotify('error', 'সার্ভার থেকে ফাইল লোড করতে সমস্যা হয়েছে');
      } finally {
        setLoadingFile(false);
      }
    },
    [authHeaders, onNotify, onUnauthorized, resetPatchState]
  );

  const fetchFiles = useCallback(
    async (keepCurrent = true) => {
      try {
        const res = await fetch(withBase('/api/editor/files'), {
          headers: authHeaders(false),
        });
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        const data = (await res.json()) as { files?: EditableFileInfo[]; error?: string };
        if (!res.ok || !data.files) {
          onNotify('error', data.error ?? 'ফাইল লিস্ট পাওয়া যায়নি');
          return;
        }
        setFiles(data.files);
        const target =
          keepCurrent && selectedFile && data.files.some((f) => f.path === selectedFile)
            ? selectedFile
            : data.files[0]?.path || '';
        if (target) {
          setSelectedFile(target);
          await loadFileContent(target);
        }
      } catch {
        onNotify('error', 'ফাইল তালিকা লোড করতে সমস্যা হয়েছে');
      }
    },
    [authHeaders, loadFileContent, onNotify, onUnauthorized, selectedFile]
  );

  useEffect(() => {
    void fetchFiles(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectFile = (newPath: string) => {
    setSelectedFile(newPath);
    void loadFileContent(newPath);
  };

  const handleChooseUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setChosenFileName('');
      setChosenFileContent('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setChosenFileName(file.name);
      setChosenFileContent(String(reader.result ?? ''));
    };
    reader.onerror = () => {
      onNotify('error', 'ফাইল পড়া যায়নি');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleUploadAndReplace = async () => {
    if (!selectedFile) return;
    if (!chosenFileContent || chosenFileContent.trim().length < 5) {
      onNotify('error', 'আগে আপনার ডিভাইস থেকে একটি ভ্যালিড কোড ফাইল সিলেক্ট করুন');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/editor/upload'), {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ filename: selectedFile, content: chosenFileContent }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        onNotify('error', data.error ?? 'ফাইল রিপ্লেস ব্যর্থ হয়েছে');
        return;
      }
      setChosenFileName('');
      setChosenFileContent('');
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      onNotify('success', data.message ?? `${selectedFile} রিপ্লেস হয়েছে!`);
      await loadFileContent(selectedFile);
    } catch {
      onNotify('error', 'আপলোড করতে নেটওয়ার্ক সমস্যা হয়েছে');
    } finally {
      setBusy(false);
    }
  };

  // Step 1: Find & Highlight in Terminal
  const handleFindAndHighlight = () => {
    if (!findText.trim()) {
      onNotify('error', 'আগে খুঁজে বের করার জন্য কোডের লাইনগুলো বসান');
      return;
    }
    const normalized = rawCode.replace(/\r\n/g, '\n');
    const target = findText.replace(/\r\n/g, '\n');
    const idx = normalized.indexOf(target);

    if (idx === -1) {
      setHighlightState({
        matched: false,
        idx: -1,
        length: 0,
        lineNum: 0,
        totalLines: 0,
        statusType: 'err',
        statusMsg: 'টার্মিনালে এই কোড খুঁজে পাওয়া যায়নি! স্পেস বা সিলেক্ট করা ফাইল চেক করুন।',
      });
      onNotify('error', 'কোড খুঁজে পাওয়া যায়নি!');
      return;
    }

    const before = normalized.slice(0, idx);
    const lineNum = before.split('\n').length;
    const totalLines = target.split('\n').length;

    setHighlightState({
      matched: true,
      idx,
      length: target.length,
      lineNum,
      totalLines,
      statusType: 'ok',
      statusMsg: `Line ${lineNum}-এ ম্যাচ পাওয়া গেছে (${totalLines} লাইন)। Confirm বাটনে চাপলে Replace ও Save হবে।`,
    });
    setEditMode(false);
    onNotify('success', `Line ${lineNum}-এ পাওয়া গেছে! এখন Replace করতে পারেন।`);

    setTimeout(() => {
      markRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  // Step 2: Confirm Replace & Save
  const handleConfirmReplace = async () => {
    if (!selectedFile || !findText.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/editor/find-replace'), {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          filename: selectedFile,
          findText,
          replaceText,
        }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = (await res.json()) as {
        message?: string;
        content?: string;
        error?: string;
      };
      if (!res.ok) {
        onNotify('error', data.error ?? 'রিপ্লেস করা যায়নি');
        return;
      }
      if (typeof data.content === 'string') {
        setRawCode(data.content);
        setDraftCode(data.content);
      }
      setFileMeta((prev) => ({ ...prev, hasBackup: true }));
      setFindText('');
      setReplaceText('');
      resetPatchState();
      onNotify('success', data.message ?? 'রিপ্লেস ও সেভ সম্পন্ন হয়েছে!');
    } catch {
      onNotify('error', 'রিপ্লেস করতে সমস্যা হয়েছে');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDirectEdit = async () => {
    if (!selectedFile) return;
    if (draftCode.trim().length < 5) {
      onNotify('error', 'কোড খালি রাখা যাবে না');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/editor/save'), {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ filename: selectedFile, content: draftCode }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        onNotify('error', data.error ?? 'সেভ করা যায়নি');
        return;
      }
      setEditMode(false);
      onNotify('success', data.message ?? `${selectedFile} সেভ হয়েছে!`);
      await loadFileContent(selectedFile);
    } catch {
      onNotify('error', 'ফাইল সেভ করতে সমস্যা হয়েছে');
    } finally {
      setBusy(false);
    }
  };

  const askRestoreBackup = () => {
    if (!selectedFile) return;
    setConfirmState({
      open: true,
      title: 'আগের ব্যাকআপে ফিরবেন?',
      message: `${selectedFile}-কে আগের সেভ করা (.bak) ভার্সনে ফিরিয়ে নেওয়া হবে।`,
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          try {
            const res = await fetch(withBase('/api/editor/restore'), {
              method: 'POST',
              headers: authHeaders(true),
              body: JSON.stringify({ filename: selectedFile }),
            });
            if (res.status === 401) {
              onUnauthorized();
              return;
            }
            const data = (await res.json()) as { message?: string; error?: string };
            if (!res.ok) {
              onNotify('error', data.error ?? 'ব্যাকআপ ফেরত আনা যায়নি');
              return;
            }
            onNotify('success', data.message ?? 'ব্যাকআপ থেকে রিস্টোর হয়েছে!');
            await loadFileContent(selectedFile);
          } catch {
            onNotify('error', 'রিস্টোর করতে সমস্যা হয়েছে');
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  };

  const handleDownloadAllTxt = async () => {
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/editor/export-txt'), {
        headers: authHeaders(false),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) {
        onNotify('error', 'ফাইল ডাউনলোড করা যায়নি');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BazarBot_All_Files_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onNotify('success', 'সব কোড ফাইল .TXT হিসেবে ডাউনলোড হয়েছে');
    } catch {
      onNotify('error', 'ডাউনলোডে সমস্যা হয়েছে');
    } finally {
      setBusy(false);
    }
  };

  const handleRebuildApp = async () => {
    setRebuilding(true);
    try {
      const res = await fetch(withBase('/api/editor/rebuild'), {
        method: 'POST',
        headers: authHeaders(false),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        onNotify('error', data.error ?? 'বিল্ড করা যায়নি');
        return;
      }
      onNotify('success', data.message ?? 'নতুন কোড বিল্ড সম্পন্ন! পরিবর্তন দেখতে পেজ রিলোড দিন।');
    } catch {
      onNotify('error', 'বিল্ড করতে সমস্যা হয়েছে');
    } finally {
      setRebuilding(false);
    }
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(rawCode);
      onNotify('success', 'সম্পূর্ণ কোড কপি হয়েছে!');
    } catch {
      onNotify('error', 'কপি করতে সমস্যা হয়েছে');
    }
  };

  const terminalSegments = useMemo(() => {
    const normalized = rawCode.replace(/\r\n/g, '\n');
    if (!highlightState.matched || highlightState.idx < 0) {
      return { before: normalized, match: '', after: '' };
    }
    return {
      before: normalized.slice(0, highlightState.idx),
      match: normalized.slice(highlightState.idx, highlightState.idx + highlightState.length),
      after: normalized.slice(highlightState.idx + highlightState.length),
    };
  }, [rawCode, highlightState]);

  return (
    <div className="space-y-3 ui-page-enter">
      {/* Top Bar */}
      <div className="ui-card mb-0">
        <div className="p-3.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button type="button" onClick={onBack} className="ui-btn ui-btn-outline">
              <i className="ri-arrow-left-line" />
              সেটিংস
            </button>
            <div className="min-w-0">
              <h2 className="text-[14.5px] font-extrabold text-[#0f172a] flex items-center gap-1.5 truncate">
                <i className="ri-file-code-fill text-[#4f46e5]" />
                Edit Code — Code Patcher &amp; Updater
              </h2>
              <p className="text-[11px] text-[#475569] font-medium truncate">
                সরাসরি কোড আপলোড, Find &amp; Replace এবং লাইভ এডিট করুন
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedFile}
              onChange={(e) => handleSelectFile(e.target.value)}
              className="px-2.5 py-1.5 rounded-[9px] border border-[#cbd5e1] bg-white text-[11.5px] font-extrabold text-[#0f172a] ui-mono max-w-[230px]"
            >
              {files.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path}
                </option>
              ))}
            </select>

            {fileMeta.hasBackup && (
              <button
                type="button"
                disabled={busy}
                onClick={askRestoreBackup}
                className="ui-btn ui-btn-danger"
              >
                <i className="ri-history-line" />
                Undo
              </button>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDownloadAllTxt()}
              className="ui-btn ui-btn-outline"
            >
              <i className="ri-file-download-fill text-[#2563eb]" />
              Download All (.TXT)
            </button>

            <button
              type="button"
              disabled={rebuilding}
              onClick={() => void handleRebuildApp()}
              className="ui-btn ui-btn-success"
              title="এডিট করার পর প্রোডাকশন বিল্ড আপডেট করুন"
            >
              <i className={rebuilding ? 'ri-loader-4-line animate-spin' : 'ri-hammer-fill'} />
              {rebuilding ? 'বিল্ড হচ্ছে...' : 'Rebuild App'}
            </button>
          </div>
        </div>
      </div>

      {/* 1. Direct File Upload & Replace */}
      <div className="ui-card mb-0">
        <div className="ui-card-head">
          <div className="flex items-center gap-2.5">
            <span
              className="ui-drawer-ico"
              style={
                {
                  '--accent': '#2563eb',
                  '--accent-soft': '#eff6ff',
                  '--accent-border': '#bfdbfe',
                } as React.CSSProperties
              }
            >
              <i className="ri-upload-cloud-2-fill" />
            </span>
            <h3>
              ১. Direct File Upload &amp; Replace (
              <span className="text-[#2563eb] ui-mono">{selectedFile || '...'}</span>)
            </h3>
          </div>
          {chosenFileName && <span className="ui-badge ui-badge-info">{chosenFileName}</span>}
        </div>
        <div className="ui-card-body">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <input
              ref={uploadInputRef}
              type="file"
              accept=".ts,.tsx,.js,.mjs,.cjs,.html,.css,.json,.txt"
              onChange={handleChooseUploadFile}
              className="flex-1 px-2.5 py-1.5 rounded-[8px] border border-[#e2e8f0] bg-white text-[12px] text-[#0f172a]"
            />
            <button
              type="button"
              disabled={busy || !chosenFileContent}
              onClick={() => void handleUploadAndReplace()}
              className="ui-btn ui-btn-primary py-2 px-4"
            >
              <i className="ri-rocket-2-fill" />
              Upload &amp; Replace File
            </button>
          </div>
        </div>
      </div>

      {/* 2. Quick Find & Replace (2-Step Safe Patcher) */}
      <div className="ui-card mb-0">
        <div className="ui-card-head">
          <div className="flex items-center gap-2.5">
            <span
              className="ui-drawer-ico"
              style={
                {
                  '--accent': '#059669',
                  '--accent-soft': '#ecfdf5',
                  '--accent-border': '#a7f3d0',
                } as React.CSSProperties
              }
            >
              <i className="ri-find-replace-fill" />
            </span>
            <h3>২. Quick Find &amp; Replace (2-Step Safe Patcher)</h3>
          </div>
        </div>
        <div className="ui-card-body space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="ui-field mb-0">
              <label htmlFor="editor-find-input">Find Specific Code Lines (পুরোনো কোড)</label>
              <textarea
                id="editor-find-input"
                rows={3}
                value={findText}
                onChange={(e) => {
                  setFindText(e.target.value);
                  resetPatchState();
                }}
                placeholder="যে ১-৩ লাইন বদলাতে চান এখানে বসান..."
                className="ui-mono"
              />
            </div>
            <div className="ui-field mb-0">
              <label htmlFor="editor-replace-input">Replace With New Code Lines (নতুন কোড)</label>
              <textarea
                id="editor-replace-input"
                rows={3}
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="নতুন রিপ্লেসমেন্ট কোড এখানে বসান..."
                className="ui-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!highlightState.matched ? (
              <button
                type="button"
                onClick={handleFindAndHighlight}
                className="ui-btn ui-btn-primary flex-1 py-2"
              >
                <i className="ri-search-eye-fill" />
                Find &amp; Highlight in Terminal
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleConfirmReplace()}
                  className="ui-btn ui-btn-success flex-1 py-2"
                >
                  <i className="ri-magic-line" />
                  Confirm Replace &amp; Save (Line {highlightState.lineNum})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetPatchState();
                    setFindText('');
                    setReplaceText('');
                    onNotify('info', 'হাইলাইট বাতিল করা হয়েছে');
                  }}
                  className="ui-btn ui-btn-danger py-2 px-4"
                >
                  <i className="ri-close-circle-line" />
                  Cancel
                </button>
              </>
            )}
          </div>

          {highlightState.statusType && (
            <div
              className={`p-2 rounded-[8px] text-[11px] font-bold flex items-center gap-1.5 ${
                highlightState.statusType === 'ok'
                  ? 'bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]'
                  : 'bg-[#fff1f2] text-[#e11d48] border border-[#fecdd3]'
              }`}
            >
              <i
                className={
                  highlightState.statusType === 'ok'
                    ? 'ri-checkbox-circle-line'
                    : 'ri-close-circle-line'
                }
              />
              <span>{highlightState.statusMsg}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Selectable Source Terminal / Direct Editor */}
      <div className="ui-card mb-0">
        <div className="ui-card-head">
          <div className="flex flex-wrap items-center gap-2">
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
              <i className="ri-terminal-box-fill" />
            </span>
            <h3>৩. Source Terminal (Selectable &amp; Copyable)</h3>
            <span className="ui-badge ui-badge-info">Select &amp; Copy Enabled</span>
            {fileMeta.size && (
              <span className="ui-mono text-[10.5px] text-[#475569]">
                {fileMeta.size} • {fileMeta.modified}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {editMode ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSaveDirectEdit()}
                  className="ui-btn ui-btn-success"
                >
                  <i className="ri-save-3-fill" />
                  Save File
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftCode(rawCode);
                    setEditMode(false);
                  }}
                  className="ui-btn ui-btn-outline"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraftCode(rawCode);
                  setEditMode(true);
                }}
                className="ui-btn ui-btn-outline"
              >
                <i className="ri-edit-2-line" />
                Edit Directly
              </button>
            )}
            <button type="button" onClick={() => void handleCopyAll()} className="ui-btn ui-btn-outline">
              <i className="ri-file-copy-line" />
              Copy All
            </button>
          </div>
        </div>

        <div className="ui-card-body">
          {editMode ? (
            <textarea
              value={draftCode}
              onChange={(e) => setDraftCode(e.target.value)}
              spellCheck={false}
              className="w-full h-[380px] bg-[#0f172a] text-[#e2e8f0] p-3 rounded-[10px] border border-[#334155] ui-mono text-[11.5px] leading-relaxed outline-none resize-y"
            />
          ) : (
            <pre className="w-full h-[380px] bg-[#0f172a] text-[#e2e8f0] p-3 rounded-[10px] border border-[#334155] ui-mono text-[11.5px] leading-relaxed overflow-auto whitespace-pre-wrap break-all select-text cursor-text">
              {loadingFile ? (
                'লোড হচ্ছে...'
              ) : highlightState.matched ? (
                <>
                  {terminalSegments.before}
                  <mark
                    ref={markRef}
                    className="bg-[#facc15] text-[#0f172a] font-bold px-1 py-0.5 rounded-[4px]"
                  >
                    {terminalSegments.match}
                  </mark>
                  {terminalSegments.after}
                </>
              ) : (
                rawCode
              )}
            </pre>
          )}
          <p className="text-[11px] text-[#475569] mt-2">
            টিপস: `src/*` এডিট করার পর ওপরে <strong className="text-[#0f172a]">Rebuild App</strong> বাটনে ক্লিক করে পেজ রিলোড দিলেই পরিবর্তন দেখা যাবে। আর <code className="px-1 py-0.5 rounded bg-[#f1f5f9]">server.ts</code> বদলালে Rebuild করার পর cPanel থেকে Restart দেবেন।
          </p>
        </div>
      </div>

      {/* Confirm Restore Modal */}
      {confirmState.open && (
        <div className="ui-modal-ov show" role="dialog" aria-modal="true">
          <div className="ui-modal max-w-[340px]">
            <div className="ui-modal-head">
              <h3>
                <i className="ri-alert-line text-[#e11d48]" />
                {confirmState.title}
              </h3>
              <button
                type="button"
                onClick={() => setConfirmState((s) => ({ ...s, open: false }))}
                className="ui-btn ui-btn-outline py-1 px-2"
              >
                <i className="ri-close-line" />
              </button>
            </div>
            <div className="p-4 text-center space-y-3">
              <div className="w-11 h-11 rounded-[12px] bg-[#fff1f2] text-[#e11d48] border border-[#fecdd3] flex items-center justify-center text-xl mx-auto">
                <i className="ri-history-line" />
              </div>
              <p className="text-[12.5px] text-[#475569] leading-relaxed">{confirmState.message}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmState((s) => ({ ...s, open: false }))}
                  className="ui-btn ui-btn-outline flex-1 py-2"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cb = confirmState.onConfirm;
                    setConfirmState({ open: false, title: '', message: '', onConfirm: null });
                    cb?.();
                  }}
                  className="ui-btn ui-btn-stop flex-1 py-2"
                >
                  <i className="ri-check-line" />
                  হ্যাঁ, রিস্টোর করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
