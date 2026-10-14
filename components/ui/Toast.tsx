'use client';

import React, { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
  links?: Array<{ label: string; href: string }>;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  onClose,
  duration = 5000,
  links
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const typeStyles = {
    success: 'border-[#2a2a2a] bg-[#101010] text-white',
    error: 'border-[#5c2a2a] bg-[#101010] text-white',
    warning: 'border-[#2a2a2a] bg-[#101010] text-white',
    info: 'border-[#2a2a2a] bg-[#101010] text-white',
  };

  const dots = {
    success: 'bg-[#7005FC]',
    error: 'bg-[#ff5c5c]',
    warning: 'bg-[#e6c200]',
    info: 'bg-[#DDD7FE]',
  };

  return (
    <div className={`
      ${typeStyles[type]}
      flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.45)]
    `}>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dots[type]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5">{message}</p>
        {links && links.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {links.map((link) => (
              <a
                key={`${link.href}-${link.label}`}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline underline-offset-2 hover:opacity-80"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onClose}
        className="text-sm text-[#DDD7FE] transition hover:text-white"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
};

// Toast Container Component
interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: ToastType; links?: Array<{ label: string; href: string }> }>;
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed right-4 top-20 z-[200] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          links={toast.links}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
};
