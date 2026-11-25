import { fontSize, minTouchTarget, palette, radius, spacing, type ColorScheme } from '@erp/design-tokens';
import { formatDateTime, type Locale, type MessageKey } from '@erp/localization';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export type StatusTone = 'up' | 'down' | 'unknown';

export function StatusRow(props: {
  label: string;
  statusLabel: string;
  tone: StatusTone;
  scheme: ColorScheme;
}) {
  const p = palette[props.scheme];
  const tone = {
    up: { fg: p.success, bg: p.successBg, glyph: '●' },
    down: { fg: p.danger, bg: p.dangerBg, glyph: '▲' },
    unknown: { fg: p.warning, bg: p.warningBg, glyph: '◆' },
  }[props.tone];
  return (
    <View
      style={[styles.row, { borderColor: p.border, backgroundColor: p.surface }]}
      accessible
      accessibilityLabel={`${props.label}: ${props.statusLabel}`}
    >
      <Text style={[styles.label, { color: p.text }]}>{props.label}</Text>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <Text style={{ color: tone.fg, fontSize: fontSize.sm }}>
          {tone.glyph} {props.statusLabel}
        </Text>
      </View>
    </View>
  );
}

export function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  scheme: ColorScheme;
  disabled?: boolean;
}) {
  const p = palette[props.scheme];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: p.primary, opacity: props.disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={{ color: p.onPrimary, fontSize: fontSize.md, fontWeight: '600' }}>{props.label}</Text>
    </Pressable>
  );
}

export function Card(props: { children: ReactNode; scheme: ColorScheme }) {
  const p = palette[props.scheme];
  return (
    <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>{props.children}</View>
  );
}

export interface HealthReportLike {
  checkedAt: string;
  checks: { name: 'database' | 'cache' | 'queue'; status: 'up' | 'down' }[];
}

const depLabel: Record<HealthReportLike['checks'][number]['name'], MessageKey> = {
  database: 'health.database',
  cache: 'health.cache',
  queue: 'health.queue',
};

/** Read-only system status card. Loading, error and empty states are explicit, never silent. */
export function HealthPanel(props: {
  scheme: ColorScheme;
  locale: Locale;
  t: (key: MessageKey) => string;
  report: HealthReportLike | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const { t, scheme } = props;
  const p = palette[scheme];
  const up = t('health.status.up');
  const down = t('health.status.down');
  return (
    <Card scheme={scheme}>
      <Text accessibilityRole="header" style={[styles.cardTitle, { color: p.text, borderColor: p.border }]}>
        {t('health.title')}
      </Text>
      {props.loading ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.pad} />
      ) : props.failed || !props.report ? (
        <View style={[styles.pad, { gap: spacing.md }]} accessibilityLiveRegion="polite">
          <StatusRow scheme={scheme} label={t('health.api')} statusLabel={down} tone="down" />
          <Text style={{ color: p.danger }}>{t('health.unreachable')}</Text>
          <PrimaryButton scheme={scheme} label={t('common.retry')} onPress={props.onRetry} />
        </View>
      ) : (
        <View>
          <StatusRow scheme={scheme} label={t('health.api')} statusLabel={up} tone="up" />
          {props.report.checks.map((c) => (
            <StatusRow
              key={c.name}
              scheme={scheme}
              label={t(depLabel[c.name])}
              statusLabel={c.status === 'up' ? up : down}
              tone={c.status}
            />
          ))}
          <Text style={[styles.pad, { color: p.textMuted, fontSize: fontSize.sm }]}>
            {t('common.lastChecked')}: {formatDateTime(props.locale, props.report.checkedAt)}
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pad: { padding: spacing.md },
  row: {
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: fontSize.md },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  button: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
