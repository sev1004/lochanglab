"use client";

import { FormEvent, useEffect, useState } from "react";
import { mapCharacterResponse, type CharacterProfile } from "@/domain/character/character-mapper";
import type { EquipmentProfile } from "@/domain/character/equipment-parser";
import type { ArkEffectProfile, ArkPassiveProfile, ArkGridProfile, GemProfile } from "@/domain/character/character-systems-parser";
import { loadLatestCharacter, saveCharacter } from "@/lib/character-storage";
import { fetchCharacter, LostArkApiError } from "@/lib/lostark-api/client";

const errorMessages: Record<number, string> = {
  401: "API 키가 올바르지 않습니다.",
  403: "API 접근 권한이 없습니다.",
  404: "캐릭터를 찾을 수 없습니다.",
  429: "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
  500: "로스트아크 API에서 오류가 발생했습니다.",
  503: "로스트아크 API가 점검 중입니다.",
};

function getErrorMessage(error: unknown) {
  if (error instanceof LostArkApiError) return errorMessages[error.status] ?? `로스트아크 API 요청에 실패했습니다. (${error.status})`;
  if (error instanceof TypeError) return "로스트아크 API에 연결하지 못했습니다. 네트워크와 브라우저 설정을 확인해주세요.";
  return error instanceof Error ? error.message : "캐릭터 조회에 실패했습니다.";
}

function qualityTone(quality: number | null) {
  if (quality === null) return "quality-none";
  if (quality >= 90) return "quality-high";
  if (quality >= 70) return "quality-mid";
  return "quality-low";
}

function ItemArtwork({ item }: { item: EquipmentProfile }) {
  return (
    <div className="item-artwork">
      {item.icon ? <img src={item.icon} alt={`${item.slot} 아이템`} /> : <span>◇</span>}
      {item.tier ? <em>{item.tier}T</em> : null}
    </div>
  );
}

function GearCard({ item }: { item: EquipmentProfile }) {
  return (
    <article className="gear-card">
      <ItemArtwork item={item} />
      <div className="item-content">
        <div className="item-heading">
          <span className="slot-label">{item.slot}</span>
          <span className="grade-label">{item.tier ? `T${item.tier} ` : ""}{item.grade}</span>
        </div>
        <strong className="item-name">{item.name}</strong>
        <div className="gear-values">
          <span className={qualityTone(item.quality)}><small>품질</small>{item.quality ?? "-"}</span>
          <span><small>아이템 레벨</small>{item.itemLevel ?? "-"}</span>
          <span><small>일반 재련</small>{item.enhancement === null ? "-" : `+${item.enhancement}`}</span>
          <span><small>상급 재련</small>{item.advancedHoning === null ? "-" : `X${item.advancedHoning}`}</span>
        </div>
      </div>
    </article>
  );
}

function AccessoryCard({ item }: { item: EquipmentProfile }) {
  return (
    <article className="accessory-card">
      <ItemArtwork item={item} />
      <div className="item-content">
        <div className="item-heading">
          <span className="slot-label">{item.slot}</span>
          <span className="grade-label">{item.tier ? `T${item.tier} ` : ""}{item.grade}</span>
        </div>
        <strong className="item-name">{item.name}</strong>
        <div className="accessory-meta">
          <span className={qualityTone(item.quality)}>품질 {item.quality ?? "-"}</span>
          {item.baseStats.map((stat) => <span key={stat}>{stat}</span>)}
        </div>
        {item.options.length ? (
          <ul className="option-list">
            {item.options.map((option, index) => <li key={`${option}-${index}`}>{option}</li>)}
          </ul>
        ) : (
          <p className="option-empty">표시 가능한 연마·부여 옵션이 없습니다.</p>
        )}
      </div>
    </article>
  );
}

function SystemArtwork({ icon, label }: { icon: string | null; label: string }) {
  return <div className="system-artwork">{icon ? <img src={icon} alt="" /> : <span>{label}</span>}</div>;
}

function GemCard({ gem }: { gem: GemProfile }) {
  return (
    <article className="gem-card">
      <SystemArtwork icon={gem.icon} label="◆" />
      <span className="gem-level">{gem.level ?? "-"}</span>
      <div><strong>{gem.type}</strong><p>{gem.skill ?? gem.name}</p><small>{gem.effect ?? "효과 정보를 불러오지 못했습니다."}</small></div>
    </article>
  );
}

function ArkEffectCard({ effect }: { effect: ArkEffectProfile }) {
  return (
    <li className="ark-effect-card">
      <SystemArtwork icon={effect.icon} label="✦" />
      <div><strong>{effect.name}</strong><p>{[effect.grade, effect.level === null ? null : `Lv.${effect.level}`].filter(Boolean).join(" · ") || "선택 효과"}</p>{effect.description ? <small>{effect.description}</small> : null}</div>
    </li>
  );
}

function ArkPassivePanel({ arkPassive }: { arkPassive: ArkPassiveProfile }) {
  const paths = [
    ["진화", arkPassive.evolution],
    ["깨달음", arkPassive.enlightenment],
    ["도약", arkPassive.leap],
  ] as const;
  const otherEffects = arkPassive.effects;
  return (
    <div className="panel system-panel">
      <div className="panel-title"><div><h3>아크패시브</h3><p>진화 · 깨달음 · 도약의 현재 포인트와 선택 효과입니다.</p></div><span>{arkPassive.isActive ? "활성" : "정보 없음"}</span></div>
      {arkPassive.points.length ? <div className="ark-points">{arkPassive.points.map((point) => <div key={point.name}><span>{point.name}</span><strong>{point.value}</strong></div>)}</div> : null}
      <div className="ark-path-grid">
        {paths.map(([name, effects]) => <section className="ark-path" key={name}><h4>{name}</h4>{effects.length ? <ul>{effects.map((effect) => <ArkEffectCard effect={effect} key={effect.id} />)}</ul> : <p>선택된 효과가 없습니다.</p>}</section>)}
      </div>
      {otherEffects.length ? <div className="ark-extra"><h4>기타 효과</h4><ul>{otherEffects.map((effect) => <ArkEffectCard effect={effect} key={effect.id} />)}</ul></div> : null}
    </div>
  );
}

function ArkGridPanel({ arkGrid }: { arkGrid: ArkGridProfile }) {
  return (
    <div className="panel system-panel">
      <div className="panel-title"><div><h3>아크그리드</h3><p>API에서 조회한 선택 코어를 시뮬레이션 기준값으로 보관합니다.</p></div><span>{arkGrid.effects.length}개</span></div>
      {arkGrid.effects.length ? <ul className="ark-grid-list">{arkGrid.effects.map((effect) => <ArkEffectCard effect={effect} key={effect.id} />)}</ul> : <p className="empty-copy">표시할 아크그리드 정보가 없습니다.</p>}
    </div>
  );
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [character, setCharacter] = useState<CharacterProfile | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState("로스트아크 API 키와 캐릭터명을 입력해주세요.");

  useEffect(() => {
    loadLatestCharacter()
      .then((stored) => {
        if (!stored) return;
        setCharacter(stored.source);
        setCharacterName(stored.source.name);
        setMessage(`${stored.source.name}의 저장된 정보를 복원했습니다. 최신 정보는 API 키를 입력해 다시 조회하세요.`);
      })
      .catch(() => setMessage("저장된 캐릭터 정보를 복원하지 못했습니다. 새로 조회할 수 있습니다."));
  }, []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedKey = apiKey.trim();
    const trimmedName = characterName.trim();
    if (!trimmedKey || !trimmedName) {
      setMessage("API 키와 캐릭터명을 모두 입력해주세요.");
      return;
    }
    setIsSearching(true);
    setMessage("로스트아크 API에서 캐릭터 정보를 불러오는 중입니다...");
    try {
      const profile = mapCharacterResponse(await fetchCharacter(trimmedName, trimmedKey));
      setCharacter(profile);
      try {
        await saveCharacter(profile);
        setMessage("최신 캐릭터 정보를 조회해 이 브라우저에 저장했습니다. API 키는 저장하지 않았습니다.");
      } catch {
        setMessage("캐릭터 조회는 완료했지만 브라우저 저장소에는 저장하지 못했습니다.");
      }
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsSearching(false);
    }
  }

  const gear = character?.equipment.filter((item) => item.category === "gear") ?? [];
  const accessories = character?.equipment.filter((item) => item.category === "accessory") ?? [];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">G</span><div><strong>GLAVIER</strong><small>DPS SIMULATOR</small></div></div>
        <nav><a className="active">캐릭터 조회</a><a>시뮬레이션</a><a>세팅 비교</a></nav>
        <button className="theme" type="button" aria-label="테마 전환">◐</button>
      </header>

      <section className="hero">
        <div><p className="eyebrow">LOST ARK · CHARACTER PROFILE</p><h1>캐릭터 스펙을 불러오세요</h1><p className="subtitle">로스트아크 API에서 캐릭터 정보를 조회하고, DPS 시뮬레이션의 기준 세팅으로 사용합니다.</p></div>
        <div className="hero-orb">✦</div>
      </section>

      <section className="search-card">
        <div className="section-title"><span className="step">01</span><div><h2>캐릭터 조회</h2><p>API 키는 브라우저 메모리에서 조회 요청에만 사용하며 저장하지 않습니다.</p></div></div>
        <form onSubmit={search} className="search-form">
          <label>Lost Ark API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API 키 또는 bearer API 키를 입력하세요" autoComplete="off" /></label>
          <label>캐릭터명<div className="name-input"><input value={characterName} onChange={(event) => setCharacterName(event.target.value)} placeholder="조회할 캐릭터명을 입력하세요" maxLength={24} /><button type="submit" disabled={isSearching}>{isSearching ? "조회 중..." : "조회하기"} <span>→</span></button></div></label>
        </form>
        <p className="form-message" aria-live="polite"><span className="status-dot" />{message}</p>
      </section>

      {character ? (
        <section className="profile-grid">
          <div className="profile-main">
            <div className="profile-heading">
              <div className="avatar">⚔</div>
              <div><p className="eyebrow">CHARACTER PROFILE</p><h2>{character.name}</h2><p>{character.server} · {character.className} · {character.engraving}</p></div>
              <span className="ready">브라우저 저장</span>
            </div>

            <div className="stat-row">
              {character.stats.map(([label, value], index) => <div className="stat" key={`${label}-${index}`}><span>{label}</span><strong>{value}</strong></div>)}
              <div className="stat"><span>아이템 레벨</span><strong>{character.level}</strong></div>
            </div>

            <div className="panel equipment-panel">
              <div className="panel-title"><div><h3>전투 장비</h3><p>DPS 계산에 사용하는 장비만 표시합니다.</p></div><span>{gear.length}개</span></div>
              {gear.length ? <div className="gear-grid">{gear.map((item) => <GearCard item={item} key={item.id} />)}</div> : <p className="empty-copy">표시할 전투 장비 정보가 없습니다.</p>}
            </div>

            <div className="panel equipment-panel">
              <div className="panel-title"><div><h3>악세사리</h3><p>품질, 기본 스탯과 연마·부여 옵션을 표시합니다.</p></div><span>{accessories.length}개</span></div>
              {accessories.length ? <div className="accessory-grid">{accessories.map((item) => <AccessoryCard item={item} key={item.id} />)}</div> : <p className="empty-copy">표시할 악세사리 정보가 없습니다.</p>}
            </div>

            <div className="panel system-panel">
              <div className="panel-title"><div><h3>보석</h3><p>스킬별 보석 종류, 레벨과 효과를 표시합니다.</p></div><span>{character.gems.length}개</span></div>
              {character.gems.length ? <div className="gem-grid">{character.gems.map((gem) => <GemCard gem={gem} key={gem.id} />)}</div> : <p className="empty-copy">표시할 보석 정보가 없습니다.</p>}
            </div>

            <ArkPassivePanel arkPassive={character.arkPassive} />
            <ArkGridPanel arkGrid={character.arkGrid} />
          </div>

          <aside className="side-column">
            <div className="panel">
              <div className="panel-title"><h3>각인</h3><span>{character.engravings.length}개</span></div>
              {character.engravings.length ? <ul className="engraving-list">{character.engravings.map((item, index) => <li key={`${item}-${index}`}><span>◆</span>{item}</li>)}</ul> : <p className="empty-copy">표시할 각인 정보가 없습니다.</p>}
            </div>
            <div className="next-card"><span className="step">02</span><h3>시뮬레이션 준비</h3><p>원본 스펙과 별도의 편집용 세팅을 브라우저에 함께 저장했습니다. 다음 단계에서 스킬과 장비를 변경할 수 있습니다.</p><button type="button">시뮬레이션으로 이동 →</button></div>
          </aside>
        </section>
      ) : (
        <section className="feature-grid">{[["⌁", "상세 스펙 조회", "장비, 각인, 스탯 정보를 한눈에 확인"], ["◇", "원본 세팅 보존", "조회한 캐릭터를 기준 세팅으로 복사"], ["✦", "DPS 시뮬레이션", "조건을 바꾸며 결과를 비교"]].map(([icon, title, text]) => <div className="feature" key={title}><span>{icon}</span><h3>{title}</h3><p>{text}</p></div>)}</section>
      )}

      <footer>DATA PROVIDED BY LOST ARK OPEN API <span>·</span> GLAVIER DPS SIMULATOR v0.1</footer>
    </main>
  );
}
