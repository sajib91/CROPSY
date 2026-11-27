import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Screen({
  children,
  header,
  footer,
  scroll = true,
  refreshing = false,
  onRefresh,
  padded = true,
}) {
  const content = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName={padded ? 'px-5 pb-10 pt-4' : 'pb-10'}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />
        ) : undefined
      }
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View className={padded ? 'flex-1 px-5 pb-10 pt-4' : 'flex-1'}>{children}</View>
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['top', 'left', 'right']}>
      {header}
      {content}
      {footer}
    </SafeAreaView>
  );
}

export function ScreenHeader({ title, subtitle, right }) {
  return (
    <View className="flex-row items-center justify-between border-b border-slate-800 px-5 py-4">
      <View className="mr-4 flex-1">
        <Text className="text-xl font-bold text-white">{title}</Text>
        {subtitle ? <Text className="mt-1 text-sm text-slate-400">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, className = '', onPress, ...props }) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      className={`rounded-2xl border border-slate-800 bg-slate-900 p-4 ${className}`}
      onPress={onPress}
      {...props}
    >
      {children}
    </Wrapper>
  );
}

const BUTTON_VARIANTS = {
  primary: 'bg-emerald-500 active:bg-emerald-400',
  secondary: 'border border-slate-700 bg-slate-800 active:bg-slate-700',
  danger: 'bg-rose-600 active:bg-rose-500',
  ghost: 'bg-transparent active:bg-slate-800',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = true,
  className = '',
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={inactive}
      onPress={onPress}
      className={`flex-row items-center justify-center rounded-xl px-5 py-3 ${
        BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary
      } ${fullWidth ? 'w-full' : ''} ${inactive ? 'opacity-50' : ''} ${className}`}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <Text className="text-base font-semibold text-white">{title}</Text>
      )}
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  multiline = false,
  error,
  helper,
}) {
  return (
    <View className="mb-4">
      {label ? <Text className="mb-2 text-sm font-medium text-slate-300">{label}</Text> : null}
      <TextInput
        value={value === undefined || value === null ? '' : String(value)}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`rounded-xl border bg-slate-900 px-4 py-3 text-base text-white ${
          error ? 'border-rose-500' : 'border-slate-700'
        }`}
      />
      {error ? <Text className="mt-1 text-xs text-rose-400">{error}</Text> : null}
      {!error && helper ? <Text className="mt-1 text-xs text-slate-500">{helper}</Text> : null}
    </View>
  );
}

export function OptionPicker({ label, options = [], value, onChange, placeholder }) {
  return (
    <View className="mb-4">
      {label ? <Text className="mb-2 text-sm font-medium text-slate-300">{label}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const optionValue = typeof option === 'string' ? option : option.value;
          const optionLabel = typeof option === 'string' ? option : option.label;
          const selected = value === optionValue;
          return (
            <Pressable
              key={String(optionValue)}
              accessibilityRole="button"
              onPress={() => onChange?.(optionValue)}
              className={`rounded-full border px-4 py-2 ${
                selected ? 'border-emerald-400 bg-emerald-500/20' : 'border-slate-700 bg-slate-900'
              }`}
            >
              <Text
                className={
                  selected ? 'text-sm font-semibold text-emerald-300' : 'text-sm text-slate-300'
                }
              >
                {optionLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {options.length === 0 && placeholder ? (
        <Text className="mt-2 text-xs text-slate-500">{placeholder}</Text>
      ) : null}
    </View>
  );
}

export function ToggleRow({ label, description, value, onChange }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onChange?.(!value)}
      className="flex-row items-center justify-between border-b border-slate-800 py-3"
    >
      <View className="mr-4 flex-1">
        <Text className="text-base text-white">{label}</Text>
        {description ? <Text className="mt-1 text-xs text-slate-400">{description}</Text> : null}
      </View>
      <View
        className={`h-7 w-12 justify-center rounded-full px-1 ${
          value ? 'bg-emerald-500' : 'bg-slate-700'
        }`}
      >
        <View className={`h-5 w-5 rounded-full bg-white ${value ? 'ml-auto' : 'mr-auto'}`} />
      </View>
    </Pressable>
  );
}

const BADGE_TONES = {
  neutral: 'border-slate-700 bg-slate-800 text-slate-300',
  success: 'border-emerald-700 bg-emerald-500/15 text-emerald-300',
  warning: 'border-amber-700 bg-amber-500/15 text-amber-300',
  danger: 'border-rose-700 bg-rose-500/15 text-rose-300',
  info: 'border-sky-700 bg-sky-500/15 text-sky-300',
};

export function Badge({ children, tone = 'neutral' }) {
  return (
    <View className={`rounded-full border px-3 py-1 ${BADGE_TONES[tone] || BADGE_TONES.neutral}`}>
      <Text className="text-xs font-semibold uppercase tracking-wide">{String(children)}</Text>
    </View>
  );
}

export function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <View className="mb-3 mt-6 flex-row items-center justify-between">
      <Text className="text-lg font-semibold text-white">{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} accessibilityRole="button">
          <Text className="text-sm font-medium text-emerald-400">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function StatCard({ label, value, hint }) {
  return (
    <Card className="min-w-[45%] flex-1">
      <Text className="text-xs uppercase tracking-wide text-slate-400">{label}</Text>
      <Text className="mt-2 text-2xl font-bold text-white">{value ?? '—'}</Text>
      {hint ? <Text className="mt-1 text-xs text-slate-500">{hint}</Text> : null}
    </Card>
  );
}

export function Row({ label, value, last = false }) {
  return (
    <View
      className={`flex-row items-start justify-between py-3 ${last ? '' : 'border-b border-slate-800'}`}
    >
      <Text className="mr-4 flex-1 text-sm text-slate-400">{label}</Text>
      <Text className="max-w-[60%] flex-1 text-right text-sm text-slate-100">
        {value === null || value === undefined || value === '' ? '—' : String(value)}
      </Text>
    </View>
  );
}

export function Tabs({ tabs = [], active, onChange }) {
  return (
    <View className="mb-4 flex-row gap-2 rounded-xl border border-slate-800 bg-slate-900 p-1">
      {tabs.map((tab) => {
        const key = typeof tab === 'string' ? tab : tab.key;
        const label = typeof tab === 'string' ? tab : tab.label;
        const selected = key === active;
        return (
          <Pressable
            key={String(key)}
            accessibilityRole="button"
            onPress={() => onChange?.(key)}
            className={`flex-1 rounded-lg px-3 py-2 ${selected ? 'bg-emerald-500' : 'bg-transparent'}`}
          >
            <Text
              className={`text-center text-sm font-semibold ${
                selected ? 'text-white' : 'text-slate-400'
              }`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({ title, message, actionLabel, onAction }) {
  return (
    <Card className="mt-6 items-center py-10">
      <Text className="text-base font-semibold text-white">{title}</Text>
      {message ? <Text className="mt-2 text-center text-sm text-slate-400">{message}</Text> : null}
      {actionLabel ? (
        <View className="mt-5 w-full max-w-[240px]">
          <Button title={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </Card>
  );
}

export function LoadingState({ label }) {
  return (
    <View className="items-center justify-center py-12">
      <ActivityIndicator color="#34d399" />
      {label ? <Text className="mt-3 text-sm text-slate-400">{label}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry, retryLabel = 'Try again' }) {
  return (
    <Card className="mt-4 border-rose-900/60">
      <Text className="text-sm font-semibold text-rose-300">Something went wrong</Text>
      <Text className="mt-2 text-sm text-slate-300">{message}</Text>
      {onRetry ? (
        <View className="mt-4">
          <Button title={retryLabel} variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </Card>
  );
}

export function Notice({ children, tone = 'info' }) {
  const tones = {
    info: 'border-sky-800 bg-sky-500/10 text-sky-200',
    warning: 'border-amber-800 bg-amber-500/10 text-amber-200',
    danger: 'border-rose-800 bg-rose-500/10 text-rose-200',
  };
  return (
    <View className={`mt-4 rounded-xl border px-4 py-3 ${tones[tone] || tones.info}`}>
      <Text className="text-xs leading-5">{children}</Text>
    </View>
  );
}

export function ClickableRow({ title, subtitle, badge, onPress, right }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center justify-between border-b border-slate-800 py-4 active:opacity-70"
    >
      <View className="mr-4 flex-1">
        <Text className="text-base font-medium text-white">{title}</Text>
        {subtitle ? <Text className="mt-1 text-xs text-slate-400">{subtitle}</Text> : null}
      </View>
      {badge ? <Badge tone={badge.tone || 'neutral'}>{badge.label}</Badge> : null}
      {right || <Text className="ml-3 text-lg text-slate-500">›</Text>}
    </Pressable>
  );
}
