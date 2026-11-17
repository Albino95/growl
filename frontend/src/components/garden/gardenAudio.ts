/**
 * Garden Relax audio.
 * Ambient loops are bundled (remote CDNs 403 on device).
 * Guided sessions stream organic human-voice recordings (CC0 / public domain) —
 * real teachers, not generated speech.
 */

export type GardenSoundscape = {
  id: string;
  label: string;
  hint: string;
  /** Local asset module */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source: any;
  /** Trees required to unlock */
  treesRequired: number;
};

export const GARDEN_SOUNDSCAPES: GardenSoundscape[] = [
  {
    id: 'rain',
    label: 'Soft rain',
    hint: 'Gentle patio rain',
    source: require('../../../assets/audio/rain.wav'),
    treesRequired: 0,
  },
  {
    id: 'forest',
    label: 'Forest air',
    hint: 'Birds & breeze',
    source: require('../../../assets/audio/forest.wav'),
    treesRequired: 1,
  },
  {
    id: 'night',
    label: 'Night wind',
    hint: 'Calm dusk hush',
    source: require('../../../assets/audio/night.wav'),
    treesRequired: 3,
  },
  {
    id: 'stream',
    label: 'Brook',
    hint: 'Water over stones',
    source: require('../../../assets/audio/stream.wav'),
    treesRequired: 5,
  },
];

export type GuidedMeditation = {
  id: string;
  title: string;
  minutes: number;
  treesRequired: number;
  /** Direct HTTPS MP3 — organic human voice */
  voiceUri: string;
  teacher: string;
  license: string;
  hint: string;
};

const IA = 'https://archive.org/download';

export const GUIDED_MEDITATIONS: GuidedMeditation[] = [
  {
    id: 'arrive',
    title: 'Arrive in the grove',
    minutes: 12,
    treesRequired: 3,
    voiceUri: `${IA}/5MinuteMindfulnessMeditation-WithShortIntroAndConclusion/5MinuteBeginnersMindfulnessOnTheBreathMeditation-WithShortIntro_relaxationAndConclusion.mp3`,
    teacher: 'Ven. Lozang Yonten',
    license: 'CC0 1.0',
    hint: 'Mindfulness of the breath — calm, secular, beginner-friendly',
  },
  {
    id: 'root',
    title: 'Root & release',
    minutes: 12,
    treesRequired: 3,
    voiceUri: `${IA}/HealingPainfulEmotionsGuidedMeditation/Huxter_healingPainfulEmotions_64kb.mp3`,
    teacher: 'Malcolm Huxter',
    license: 'Public domain',
    hint: 'A gentle body-and-heart practice for letting tension go',
  },
  {
    id: 'witness',
    title: 'Witness yourself',
    minutes: 19,
    treesRequired: 5,
    voiceUri: `${IA}/ConnectingWithTheEarthAndTheUniverseGuidedMeditation/ConnectingWithTheEarthAndTheUniverseGuidedMeditation.mp3`,
    teacher: 'Public-domain guide',
    license: 'Public domain',
    hint: 'Ground into earth, then widen into quiet space',
  },
  {
    id: 'sanctuary',
    title: 'Full sanctuary',
    minutes: 23,
    treesRequired: 8,
    voiceUri: `${IA}/LearnToRelaxAudiobook-Part1/LearnToRelaxEpisode01_SW_mono.mp3`,
    teacher: 'Gordon Rosenberg',
    license: 'CC0 1.0',
    hint: 'The author reads his relaxation guide — slow, reassuring, human',
  },
];
