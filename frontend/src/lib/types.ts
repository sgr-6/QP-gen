export type ExamType = 'internal' | 'semester';

export interface ExamConfig {
  totalMarks: number;
  parts: number;
  marksPerPart: number;
  questionsPerPart: number;
  subQuestionsRange: [number, number];
}

export const EXAM_CONFIGS: Record<ExamType, ExamConfig> = {
  internal: {
    totalMarks: 50,
    parts: 2,
    marksPerPart: 25,
    questionsPerPart: 2,
    subQuestionsRange: [2, 3], // 2 or 3 sub-questions per question
  },
  semester: {
    totalMarks: 100,
    parts: 5, // Typically 5 modules
    marksPerPart: 20,
    questionsPerPart: 2, // 2 choices per module
    subQuestionsRange: [2, 3],
  }
};
