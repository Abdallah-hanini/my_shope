import { HealthPanel } from '@erp/mobile-ui';
import { fontSize, palette, spacing } from '@erp/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from './config';
import { useLocale } from './locale';

export function HomeScreen() {
  const { t, dir, locale, toggle } = useLocale();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const p = palette[scheme];
  const health = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: () => api.ready(),
    refetchInterval: 60_000,
  });

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: p.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={[styles.content, { direction: dir }]}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[styles.title, { color: p.text }]}>
            {t('app.manager.name')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLanguage={locale === 'ar' ? 'en' : 'ar'}
            onPress={toggle}
            style={[styles.lang, { borderColor: p.border }]}
          >
            <Text style={{ color: p.text, fontWeight: '600' }}>{t('common.switchLanguage')}</Text>
          </Pressable>
        </View>
        <Text style={{ color: p.textMuted, fontSize: fontSize.md }}>{t('manager.home.subtitle')}</Text>
        <Text style={[styles.notice, { color: p.warning, backgroundColor: p.warningBg }]}>
          {t('foundation.notice')}
        </Text>
        <HealthPanel
          scheme={scheme}
          locale={locale}
          t={t}
          report={health.data}
          loading={health.isPending}
          failed={health.isError}
          onRetry={() => void health.refetch()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: '700', flexShrink: 1 },
  lang: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
  },
  notice: { padding: spacing.md, borderRadius: 8, fontSize: fontSize.sm },
});
