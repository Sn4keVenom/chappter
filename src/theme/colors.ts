// src/theme/colors.ts
//
// Neutral, professional default palette — swap these for the chapter's
// actual brand colors. Kept deliberately restrained (one accent) per the
// "professional, not social" design direction: this is an ops tool, not
// a social app.

export const colors = {
  background: "#F7F8FA",
  surface: "#FFFFFF",
  border: "#E3E6EA",

  textPrimary: "#13181F",
  textSecondary: "#5C6470",
  textMuted: "#9AA1AC",

  primary: "#1B2A4A", // deep navy — header bars, primary buttons
  primaryText: "#FFFFFF",

  accent: "#C8A24A", // single restrained gold accent — leaderboard top 3, required-event tag

  success: "#1E7F4F", // attended / paid
  warning: "#B5790A", // partial dues / late check-in
  danger: "#B23A3A", // unpaid / missed required event

  categoryBrotherhood: "#5B6CC0",
  categoryService: "#2F8F6E",
  categoryProfessional: "#1B2A4A",
  categoryRush: "#C8A24A",
  categoryAdmin: "#5C6470",
};

export type AppColors = typeof colors;
