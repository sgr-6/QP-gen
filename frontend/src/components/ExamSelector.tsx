"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { FileText, BookOpen } from 'lucide-react';
import { ExamType, EXAM_CONFIGS } from '@/lib/types';

interface ExamSelectorProps {
  selectedType: ExamType | null;
  onSelect: (type: ExamType) => void;
}

export default function ExamSelector({ selectedType, onSelect }: ExamSelectorProps) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <h3 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px' }}>Select Exam Type</h3>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        
        {/* Internal Test Option */}
        <motion.div
          className="card"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect('internal')}
          style={{
            flex: '1 1 300px',
            cursor: 'pointer',
            margin: 0,
            border: selectedType === 'internal' ? '2px solid var(--primary-purple)' : '2px solid transparent',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {selectedType === 'internal' && (
            <motion.div
              layoutId="outline"
              initial={false}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'var(--primary-light)',
                opacity: 0.3,
                zIndex: 0
              }}
            />
          )}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
              <div style={{ background: 'var(--primary-light)', padding: '12px', borderRadius: '50%', color: 'var(--primary-purple)' }}>
                <FileText size={24} />
              </div>
              <h4 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Internal Test</h4>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
              Generate a {EXAM_CONFIGS.internal.totalMarks}-mark paper consisting of {EXAM_CONFIGS.internal.parts} parts.
            </p>
          </div>
        </motion.div>

        {/* Semester End Option */}
        <motion.div
          className="card"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect('semester')}
          style={{
            flex: '1 1 300px',
            cursor: 'pointer',
            margin: 0,
            border: selectedType === 'semester' ? '2px solid var(--primary-purple)' : '2px solid transparent',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {selectedType === 'semester' && (
            <motion.div
              layoutId="outline"
              initial={false}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'var(--primary-light)',
                opacity: 0.3,
                zIndex: 0
              }}
            />
          )}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
              <div style={{ background: 'var(--primary-light)', padding: '12px', borderRadius: '50%', color: 'var(--primary-purple)' }}>
                <BookOpen size={24} />
              </div>
              <h4 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Semester End Exam</h4>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
              Generate a full {EXAM_CONFIGS.semester.totalMarks}-mark paper using the standard {EXAM_CONFIGS.semester.parts}-module university format.
            </p>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
