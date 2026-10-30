'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import styles from './Reader.module.css';

// Steps of the size slider, on top of the iPhone text size
export const sizeSteps = [0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];

export type ReaderSettings = {
  size: number; // index into sizeSteps
  font: 'serif' | 'sans' | 'legible';
  leading: 'tight' | 'normal' | 'loose';
  spacing: 'normal' | 'wide';
  width: 'narrow' | 'normal' | 'wide';
  theme: 'auto' | 'light' | 'sepia' | 'dark';
  bold: boolean;
};

export const defaultSettings: ReaderSettings = {
  size: 1,
  font: 'serif',
  leading: 'normal',
  spacing: 'normal',
  width: 'normal',
  theme: 'auto',
  bold: false,
};

const choices = {
  font: [
    ['serif', 'Schreef'],
    ['sans', 'Zonder'],
    ['legible', 'Leesbaar'],
  ],
  leading: [
    ['tight', 'Krap'],
    ['normal', 'Normaal'],
    ['loose', 'Ruim'],
  ],
  spacing: [
    ['normal', 'Normaal'],
    ['wide', 'Ruim'],
  ],
  width: [
    ['narrow', 'Smal'],
    ['normal', 'Normaal'],
    ['wide', 'Breed'],
  ],
  theme: [
    ['auto', 'Auto'],
    ['light', 'Licht'],
    ['sepia', 'Sepia'],
    ['dark', 'Donker'],
  ],
} as const;

type ChoiceKey = keyof typeof choices;

// Remembered on this device only; anything unreadable falls back to the defaults
const storageKey = 'instavol.reader';

export function loadSettings(): ReaderSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<ReaderSettings>;
    const settings = { ...defaultSettings };
    if (Number.isInteger(saved.size) && sizeSteps[saved.size!] !== undefined) settings.size = saved.size!;
    for (const key of Object.keys(choices) as ChoiceKey[]) {
      if (choices[key].some(([value]) => value === saved[key])) {
        (settings[key] as string) = saved[key] as string;
      }
    }
    if (typeof saved.bold === 'boolean') settings.bold = saved.bold;
    return settings;
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: ReaderSettings) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // Private browsing or blocked storage: the choice just isn't remembered
  }
}

// Attributes for the reader element; Reader.module.css turns them into the actual styles
export function settingsAttributes(settings: ReaderSettings) {
  return {
    'data-font': settings.font,
    'data-leading': settings.leading,
    'data-spacing': settings.spacing,
    'data-width': settings.width,
    'data-theme': settings.theme,
    'data-bold': settings.bold,
    style: { '--reader-scale': sizeSteps[settings.size] } as CSSProperties,
  };
}

function Segmented<K extends ChoiceKey>({
  name,
  label,
  value,
  onChange,
}: {
  name: K;
  label: string;
  value: ReaderSettings[K];
  onChange: (value: ReaderSettings[K]) => void;
}) {
  return (
    <fieldset className={styles.setting}>
      <legend className={styles.settingLabel}>{label}</legend>
      <div className={styles.segmented}>
        {choices[name].map(([option, text]) => (
          <label key={option} className={styles.segment} data-option={`${name}-${option}`}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option as ReaderSettings[K])}
            />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Bottom sheet with the reading options; every change shows right away in the article behind it
export function ReaderSettingsSheet({
  settings,
  onChange,
  onClose,
}: {
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
  onClose: () => void;
}) {
  const doneButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    doneButton.current?.focus({ focusVisible: false } as FocusOptions);
  }, []);

  function set<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className={styles.settingsBackdrop} onClick={onClose}>
      <div
        className={styles.settingsSheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.settingsHeader}>
          <h2 id="reader-settings-title" className={styles.settingsTitle}>
            Weergave
          </h2>
          <button ref={doneButton} className={styles.settingsDone} onClick={onClose}>
            Klaar
          </button>
        </div>

        <div className={styles.settingsScroll}>
          <div className={styles.setting}>
            <label className={styles.settingLabel} htmlFor="reader-size">
              Tekstgrootte
            </label>
            <div className={styles.sizeRow}>
              <span className={styles.sizeSmall} aria-hidden="true">
                A
              </span>
              <input
                id="reader-size"
                className={styles.slider}
                type="range"
                min={0}
                max={sizeSteps.length - 1}
                step={1}
                value={settings.size}
                aria-valuetext={`${Math.round(sizeSteps[settings.size] * 100)}%`}
                onChange={(event) => set('size', Number(event.target.value))}
              />
              <span className={styles.sizeLarge} aria-hidden="true">
                A
              </span>
            </div>
          </div>

          <Segmented name="font" label="Lettertype" value={settings.font} onChange={(v) => set('font', v)} />
          <Segmented name="leading" label="Regelafstand" value={settings.leading} onChange={(v) => set('leading', v)} />
          <Segmented name="spacing" label="Letter- en woordafstand" value={settings.spacing} onChange={(v) => set('spacing', v)} />
          <Segmented name="width" label="Kolombreedte" value={settings.width} onChange={(v) => set('width', v)} />
          <Segmented name="theme" label="Achtergrond" value={settings.theme} onChange={(v) => set('theme', v)} />

          <label className={styles.toggleRow}>
            <span>Vettere tekst</span>
            <input
              type="checkbox"
              role="switch"
              className={styles.toggle}
              checked={settings.bold}
              onChange={(event) => set('bold', event.target.checked)}
            />
          </label>

          <button className={styles.settingsReset} onClick={() => onChange({ ...defaultSettings })}>
            Standaard herstellen
          </button>
        </div>
      </div>
    </div>
  );
}
