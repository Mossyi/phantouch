import { DungeonScript, VoiceConfig } from '../../types';

const CHARACTER_VOICES: VoiceConfig[] = [
  { gender: 'female', pitch: 1.05, rate: 0.98, voiceName: 'Xiaoxiao', neuralVoice: 'zh-CN-XiaoxiaoNeural', siliconflowVoice: 'anna' },
  { gender: 'female', pitch: 0.92, rate: 0.94, voiceName: 'Xiaohan', neuralVoice: 'zh-CN-XiaohanNeural', siliconflowVoice: 'fiona' },
  { gender: 'male', pitch: 0.9, rate: 0.96, voiceName: 'Yunxi', neuralVoice: 'zh-CN-YunxiNeural', siliconflowVoice: 'alex' },
  { gender: 'female', pitch: 1.12, rate: 1.04, voiceName: 'Xiaoyi', neuralVoice: 'zh-CN-XiaoyiNeural', siliconflowVoice: 'anna' },
];

export const DUNGEON_NARRATOR_VOICE: VoiceConfig = {
  gender: 'female',
  pitch: 0.96,
  rate: 0.92,
  voiceName: 'Xiaohan',
  neuralVoice: 'zh-CN-XiaohanNeural',
  siliconflowVoice: 'fiona',
};

export const getDungeonCharacterVoice = (script: DungeonScript, speaker: string): VoiceConfig => {
  const source = `${script.id}:${speaker}`;
  const index = [...source].reduce((sum, char) => sum + char.charCodeAt(0), 0) % CHARACTER_VOICES.length;
  return { ...CHARACTER_VOICES[index] };
};
