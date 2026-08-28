import { mapCharacterResponse, type CharacterProfile } from "@/domain/character/character-mapper";

const DATABASE_NAME = "glavier-dps-simulator";
const DATABASE_VERSION = 1;
const CHARACTER_STORE = "characters";
const LATEST_KEY = "glavier-dps-simulator:latest-character";

export type StoredCharacter = {
  id: string;
  source: CharacterProfile;
  loadout: CharacterProfile;
  savedAt: string;
  schemaVersion: 4;
};

type LegacyStoredCharacter = Omit<StoredCharacter, "schemaVersion"> & { schemaVersion?: 1 | 2 | 3 };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CHARACTER_STORE)) {
        database.createObjectStore(CHARACTER_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("브라우저 저장소를 열 수 없습니다."));
  });
}

function characterId(name: string) {
  return name.trim().toLocaleLowerCase("ko-KR");
}

export async function saveCharacter(profile: CharacterProfile): Promise<StoredCharacter> {
  const database = await openDatabase();
  const stored: StoredCharacter = {
    id: characterId(profile.name),
    source: structuredClone(profile),
    loadout: structuredClone(profile),
    savedAt: new Date().toISOString(),
    schemaVersion: 4,
  };
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CHARACTER_STORE, "readwrite");
    transaction.objectStore(CHARACTER_STORE).put(stored);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("캐릭터 정보를 저장하지 못했습니다."));
    transaction.onabort = () => reject(transaction.error ?? new Error("캐릭터 정보 저장이 취소되었습니다."));
  });
  database.close();
  localStorage.setItem(LATEST_KEY, stored.id);
  return stored;
}

export async function loadLatestCharacter(): Promise<StoredCharacter | null> {
  const id = localStorage.getItem(LATEST_KEY);
  if (!id) return null;
  const database = await openDatabase();
  const stored = await new Promise<StoredCharacter | LegacyStoredCharacter | undefined>((resolve, reject) => {
    const request = database.transaction(CHARACTER_STORE, "readonly").objectStore(CHARACTER_STORE).get(id);
    request.onsuccess = () => resolve(request.result as StoredCharacter | LegacyStoredCharacter | undefined);
    request.onerror = () => reject(request.error ?? new Error("저장된 캐릭터를 읽지 못했습니다."));
  });
  database.close();
  if (!stored) return null;
  if (stored.schemaVersion === 4) return stored;

  return {
    ...stored,
    source: mapCharacterResponse(stored.source.raw),
    loadout: mapCharacterResponse(stored.loadout.raw),
    schemaVersion: 4,
  };
}
