import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { fs, sc } from '@/lib/scale'

export type SettingsDropdownId = 'language' | 'month' | 'provider' | 'model' | null
export const SETTINGS_DROPDOWN_MAX_ITEMS = 4

type SettingsDropdownProps<T> = {
  open: boolean
  onToggle: () => void
  onSelect: (option: T) => void
  options: T[]
  optionKey: (option: T) => string
  optionLabel: (option: T) => string
  value: ReactNode
  renderOption?: (option: T, active: boolean) => ReactNode
  isActive?: (option: T) => boolean
  footer?: ReactNode
  openField?: ReactNode
  maxItems?: number
}

export function SettingsDropdown<T>({
  open, onToggle, onSelect, options, optionKey, optionLabel, value,
  renderOption, isActive, footer, maxItems = SETTINGS_DROPDOWN_MAX_ITEMS,
  openField,
}: SettingsDropdownProps<T>) {
  return (
    <View style={[styles.wrap, open && styles.wrapOpen]}>
      {open && openField ? (
        <View style={styles.field} onStartShouldSetResponder={() => true}>
          {openField}
        </View>
      ) : (
        <TouchableOpacity
          style={styles.field}
          onPress={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          activeOpacity={0.75}
        >
          <View style={styles.value}>{value}</View>
          <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      )}
      {open && (
        <View style={styles.list}>
          <ScrollView
            style={{ maxHeight: sc(maxItems * 40) }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {options.map((option) => {
              const active = isActive?.(option) ?? false
              return (
                <TouchableOpacity
                  key={optionKey(option)}
                  style={[styles.item, active && styles.itemActive]}
                  onPress={(e) => {
                    e.stopPropagation()
                    onSelect(option)
                    onToggle()
                  }}
                >
                  {renderOption ? renderOption(option, active) : (
                    <Text style={[styles.itemText, active && styles.itemTextActive]}>{optionLabel(option)}</Text>
                  )}
                  {active && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
          {footer && (
            <View onStartShouldSetResponder={() => true}>
              {footer}
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Open menus must win against every other control in the settings surface.
  wrap: { position: 'relative', zIndex: 30, elevation: 30 },
  wrapOpen: { zIndex: 10000, elevation: 10000 },
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sc(6),
    height: sc(40), borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: sc(8),
    paddingHorizontal: sc(10), backgroundColor: '#1A2333',
  },
  value: { flex: 1, minWidth: 0 },
  chevron: { fontSize: fs(9), color: '#1FC3A4' },
  list: {
    position: 'absolute', top: sc(46), left: 0, right: 0,
    backgroundColor: '#1A2333', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: sc(8), overflow: 'hidden', zIndex: 10001, elevation: 10001,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: sc(38), paddingVertical: sc(8), paddingHorizontal: sc(10),
  },
  itemActive: { backgroundColor: 'rgba(112,66,214,0.15)' },
  itemText: { flex: 1, fontFamily: 'SourceCodePro', fontSize: fs(11), color: '#FAFAF7' },
  itemTextActive: { color: '#8A60EB' },
  check: { fontSize: fs(14), color: '#1FC3A4', marginLeft: sc(6) },
})
