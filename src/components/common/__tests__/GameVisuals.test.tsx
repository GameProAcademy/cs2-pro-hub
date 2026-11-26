/**
 * Visual Game Language — shared CS2 elements. They decorate real values only: the text is always
 * there, ambiguous parser names are never "corrected", and a missing value renders nothing.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  GrenadeLabel,
  MapTile,
  WeaponLabel,
  weaponDisplayName,
  weaponIcon,
} from "@/components/common/GameVisuals";
import { I18nProvider } from "@/i18n";
import { dictionaries, type Locale } from "@/i18n/config";
import { GRENADES } from "@/lib/utility/utility";

const LOCALES: Locale[] = ["pt-BR", "en", "es", "fr", "pt-PT"];
const html = (node: React.ReactNode, l: Locale = "pt-BR") =>
  renderToString(<I18nProvider initialLocale={l}>{node}</I18nProvider>);

describe("WeaponLabel", () => {
  it("shows the weapon name next to its class pictogram", () => {
    const out = html(<WeaponLabel weapon="ak47" />);
    expect(out).toContain("AK-47");
    expect(out).toContain('data-weapon-icon="rifle"');
    expect(out).toContain('aria-hidden="true"');
    expect(html(<WeaponLabel weapon="awp" />)).toContain('data-weapon-icon="sniper"');
    expect(html(<WeaponLabel weapon="knife_karambit" />)).toContain('data-weapon-icon="knife"');
    expect(html(<WeaponLabel weapon="hegrenade" />)).toContain('data-weapon-icon="grenade"');
    expect(html(<WeaponLabel weapon="inferno" />)).toContain('data-weapon-icon="fire"');
    expect(html(<WeaponLabel weapon="planted_c4" />)).toContain('data-weapon-icon="bomb"');
  });

  it("keeps the parser's name where it is ambiguous", () => {
    // player_hurt names the M4A1-S "m4a1" and the USP-S "hkp2000" (combat/weapons.ts).
    expect(weaponDisplayName("m4a1")).toBe("m4a1");
    expect(weaponDisplayName("hkp2000")).toBe("hkp2000");
    expect(weaponDisplayName("some_new_weapon")).toBe("some_new_weapon");
  });

  it("renders nothing for a missing weapon and no icon for an unknown world source", () => {
    expect(html(<WeaponLabel weapon={null} />)).toBe("");
    expect(weaponIcon("world")).toBeNull();
    expect(html(<WeaponLabel weapon="world" />)).toContain('data-weapon-icon="none"');
  });
});

describe("GrenadeLabel", () => {
  it("names every grenade type in the five locales with the utility tone", () => {
    for (const l of LOCALES)
      for (const g of GRENADES) {
        const out = html(<GrenadeLabel grenade={g} />, l);
        const label = (dictionaries[l] as Record<string, string>)[`nade.grenade.${g}`];
        expect(label, `${l} ${g}`).toBeTruthy();
        expect(out).toContain("text-category-utility");
      }
  });
});

describe("MapTile", () => {
  it("identifies a real map with its code and an accessible name", () => {
    const out = html(<MapTile map="de_mirage" />);
    expect(out).toContain('data-map-tile="de_mirage"');
    expect(out).toContain('class="sr-only">Mirage<');
    expect(html(<MapTile map="de_mirage" showName />)).toContain(">Mirage</span>");
  });

  it("renders nothing for an unknown map (no invented identity)", () => {
    expect(html(<MapTile map={null} />)).toBe("");
    expect(html(<MapTile map="" />)).toBe("");
  });
});
