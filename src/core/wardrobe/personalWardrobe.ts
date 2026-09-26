import type { WardrobeItem } from './wardrobeData';
export interface PersonalItem extends WardrobeItem { archived: boolean }
export interface WardrobeLook { id: string; name: string; itemIds: string[]; archived: boolean }
export interface PersonalWardrobe { customItems: PersonalItem[]; looks: WardrobeLook[]; ownership: Record<string, 'owned' | 'wanted'> }
export const WARDROBE_PLACEHOLDER = '/wardrobe/personal-placeholder.svg';
export const PERSONAL_CATEGORIES = ['maid', 'lingerie', 'dress', 'cosplay', 'accessory', 'casual', 'formal', 'traditional', 'toy'];
export function normalizePersonalWardrobe(raw: any, builtins: WardrobeItem[]): PersonalWardrobe {
  const seen = new Set<string>();
  const customItems: PersonalItem[] = !Array.isArray(raw?.customItems) ? [] : raw.customItems.flatMap((v: any) => {
    if (!v || typeof v.id !== 'string' || !/^personal-[\w-]{1,80}$/.test(v.id) || seen.has(v.id) || typeof v.name !== 'string' || !v.name.trim()) return [];
    seen.add(v.id);
    return [{ id: v.id, name: v.name.trim().slice(0, 80), category: PERSONAL_CATEGORIES.includes(v.category) ? v.category : 'casual', avatar: '衣', image: typeof v.image === 'string' && v.image.length <= 160000 && /^data:image\/(?:jpeg|png|webp);base64,/i.test(v.image) ? v.image : WARDROBE_PLACEHOLDER, stylingTips: [], femininityBonus: 0, description: typeof v.description === 'string' ? v.description.slice(0, 500) : '', hardwareTask: '', archived: v.archived === true }];
  }).slice(0, 30);
  const itemIds = new Set([...builtins, ...customItems].map(i => i.id));
  const looks: WardrobeLook[] = !Array.isArray(raw?.looks) ? [] : raw.looks.flatMap((v: any) => {
    if (!v || typeof v.id !== 'string' || !/^look-[\w-]{1,80}$/.test(v.id) || seen.has(v.id) || typeof v.name !== 'string' || !v.name.trim() || !Array.isArray(v.itemIds)) return [];
    const ids = [...new Set<string>(v.itemIds.filter((id: unknown) => typeof id === 'string' && itemIds.has(id)))].slice(0, 12);
    if (!ids.length) return [];
    seen.add(v.id); return [{ id: v.id, name: v.name.trim().slice(0, 80), itemIds: ids, archived: v.archived === true }];
  }).slice(0, 50);
  const ownership: PersonalWardrobe['ownership'] = {};
  if (raw?.ownership && typeof raw.ownership === 'object') for (const [id, status] of Object.entries(raw.ownership)) if (itemIds.has(id) && (status === 'owned' || status === 'wanted')) ownership[id] = status;
  return { customItems, looks, ownership };
}
export function personalCatalog(state: PersonalWardrobe, builtins: WardrobeItem[], includeArchived = false): WardrobeItem[] {
  const items = [...builtins, ...state.customItems];
  const looks: WardrobeItem[] = state.looks.filter(l => includeArchived || !l.archived).map(look => ({ id: look.id, name: look.name, category: 'casual', avatar: '搭', image: items.find(i => i.id === look.itemIds[0])?.image || WARDROBE_PLACEHOLDER, description: look.itemIds.map(id => items.find(i => i.id === id)?.name || '已移除物品').join(' + '), stylingTips: [], femininityBonus: 0, hardwareTask: '' }));
  return [...builtins, ...state.customItems.filter(i => includeArchived || !i.archived), ...looks];
}
