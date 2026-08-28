"use client";

import { FormEvent, useEffect, useState } from "react";
import { mapCharacterResponse, type CharacterProfile } from "@/domain/character/character-mapper";
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
            <div className="profile-heading"><div className="avatar">⚔</div><div><p className="eyebrow">CHARACTER PROFILE</p><h2>{character.name}</h2><p>{character.server} · {character.className} · {character.engraving}</p></div><span className="ready">브라우저 저장</span></div>
            <div className="stat-row">{character.stats.map(([label, value], index) => <div className="stat" key={`${label}-${index}`}><span>{label}</span><strong>{value}</strong></div>)}<div className="stat"><span>아이템 레벨</span><strong>{character.level}</strong></div></div>
            <div className="panel"><div className="panel-title"><h3>장비</h3><span>{character.equipment.length}개</span></div><div className="equipment-grid">{character.equipment.map(([slot, name, grade], index) => <div className="equipment" key={`${slot}-${index}`}><div className="item-icon">◇</div><div><strong>{slot}</strong><p>{name}</p><small>{grade}</small></div></div>)}</div></div>
          </div>
          <aside className="side-column">
            <div className="panel"><div className="panel-title"><h3>각인</h3><span>{character.engravings.length}개</span></div>{character.engravings.length ? <ul className="engraving-list">{character.engravings.map((item, index) => <li key={`${item}-${index}`}><span>◆</span>{item}</li>)}</ul> : <p className="empty-copy">표시할 각인 정보가 없습니다.</p>}</div>
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
