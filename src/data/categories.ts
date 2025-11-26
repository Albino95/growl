export type Subcategory = { key: string; label: string };
export type Category = { key: string; label: string; subcategories: Subcategory[] };

const CATEGORIES: Category[] = [
  {
    key: 'fitness',
    label: 'Fitness',
    subcategories: [
      { key: 'losing-weight', label: 'Losing Weight' },
      { key: 'building-muscle', label: 'Building Muscle' },
      { key: 'cardio', label: 'Cardio' },
      { key: 'flexibility', label: 'Flexibility' },
      { key: 'strength', label: 'Strength Training' },
    ],
  },
  {
    key: 'art',
    label: 'Art',
    subcategories: [
      { key: 'piano', label: 'Piano' },
      { key: 'guitar', label: 'Guitar' },
      { key: 'drawing', label: 'Drawing' },
      { key: 'painting', label: 'Painting' },
      { key: 'photography', label: 'Photography' },
    ],
  },
  {
    key: 'nutrition',
    label: 'Nutrition',
    subcategories: [
      { key: 'meal-planning', label: 'Meal Planning' },
      { key: 'healthy-eating', label: 'Healthy Eating' },
      { key: 'weight-management', label: 'Weight Management' },
      { key: 'cooking', label: 'Cooking Skills' },
    ],
  },
  {
    key: 'mindset',
    label: 'Mindset',
    subcategories: [
      { key: 'meditation', label: 'Meditation' },
      { key: 'positive-thinking', label: 'Positive Thinking' },
      { key: 'stress-management', label: 'Stress Management' },
      { key: 'self-confidence', label: 'Self Confidence' },
    ],
  },
  {
    key: 'discipline',
    label: 'Discipline',
    subcategories: [
      { key: 'time-management', label: 'Time Management' },
      { key: 'habit-building', label: 'Habit Building' },
      { key: 'productivity', label: 'Productivity' },
      { key: 'goal-setting', label: 'Goal Setting' },
    ],
  },
  {
    key: 'martial-arts',
    label: 'Martial Arts',
    subcategories: [
      { key: 'karate', label: 'Karate' },
      { key: 'jiu-jitsu', label: 'Jiu-Jitsu' },
      { key: 'boxing', label: 'Boxing' },
      { key: 'taekwondo', label: 'Taekwondo' },
    ],
  },
  {
    key: 'language',
    label: 'Language Learning',
    subcategories: [
      { key: 'spanish', label: 'Spanish' },
      { key: 'french', label: 'French' },
      { key: 'mandarin', label: 'Mandarin' },
      { key: 'japanese', label: 'Japanese' },
    ],
  },
  {
    key: 'coding',
    label: 'Coding',
    subcategories: [
      { key: 'web-development', label: 'Web Development' },
      { key: 'mobile-development', label: 'Mobile Development' },
      { key: 'data-science', label: 'Data Science' },
      { key: 'algorithms', label: 'Algorithms' },
    ],
  },
];

export default CATEGORIES;
