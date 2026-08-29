export type EngravingCatalogEntry = {
  name: string;
  icon: string;
};

// 시뮬레이터에서 직접 변경할 수 있는 창술사 범용 각인 목록이다.
// 이미지는 로스트아크 공식 CDN을 그대로 사용한다.
export const ENGRAVING_CATALOG: EngravingCatalogEntry[] = [
  { name: "원한", icon: "https://cdn-lostark.game.onstove.com/EFUI_IconAtlas/Buff/Buff_71.png" },
  { name: "저주받은 인형", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/buff/buff_237.png" },
  { name: "돌격대장", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/buff/buff_210.png" },
  { name: "기습의 대가", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/buff/buff_148.png" },
  { name: "마나 효율 증가", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/buff/buff_166.png" },
  { name: "아드레날린", icon: "https://cdn-lostark.game.onstove.com/EFUI_IconAtlas/Ability/Ability_235.png" },
  { name: "질량 증가", icon: "https://cdn-lostark.game.onstove.com/EFUI_IconAtlas/Ability/Ability_231.png" },
  { name: "예리한 둔기", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/achieve/achieve_03_40.png" },
];

export const ENGRAVING_NAMES = ENGRAVING_CATALOG.map((engraving) => engraving.name);

export function engravingIcon(name: string) {
  return ENGRAVING_CATALOG.find((engraving) => engraving.name === name)?.icon ?? null;
}
