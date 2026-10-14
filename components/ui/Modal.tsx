'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  showCloseButton = true,
}) => {
  const [mounted, setMounted] = useState(typeof document !== 'undefined');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-[#070010]/75 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[min(90dvh,640px)] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-[#15111B] shadow-[0_24px_80px_rgba(7,0,16,0.65)]">
        {title && (
          <div className="flex items-center justify-between px-5 pb-1 pt-5">
            <h2 className="text-lg font-medium text-[#FCFBFF]">{title}</h2>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-[#E4E4E4] transition hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        )}
        <div className="px-5 pb-5 pt-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
};
