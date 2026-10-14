'use client';

import React from 'react';
import { motion } from 'framer-motion';

export function PartnershipsRevealSection() {
  return (
    <div className="relative z-10 w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8"
      >
        <div className="advisor-card block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/monblip-mark.png"
            alt="MonBlip"
            className="advisor-card-photo"
          />

          {/* Confirmed badge */}
          <div className="advisor-card-badge">
            <span className="advisor-card-badge-dot" />
            Confirmed
          </div>

        </div>
      </motion.div>
    </div>
  );
}
