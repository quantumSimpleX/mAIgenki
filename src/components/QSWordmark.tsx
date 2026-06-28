import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

// SVG paths from icon-q-white-transparent.svg (QSXC DesignSys)
const QS_OUTER = 'M369.8,138.5c14.3,53.6,4,108.3-24.6,151.2l46.8,46.8l-54.4,54.8l-47.2-47.2c-16.3,10.3-34.1,18.7-54,24.2c-100.4,27-203.6-32.5-230.2-132.1C-20.3,136.1,39.3,33.3,139.7,6.4C239.7-20.2,342.8,38.9,369.8,138.5z'
const QS_INNER = 'M199.2,226.5l78.7-102.2l-74.8-67.4L91.3,124.3l80.2,102.3l-23,29.7l-38.2,47.6h75.2h75.2l-38.2-47.7L199.2,226.5z M135.8,123.3l57.8-34.8l-14.1,112.6l-50.8-64.8H183l1.6-13L135.8,123.3L135.8,123.3z M240.8,136.3l-49.5,64.3l14-111.9l38.4,34.6h-38.2l-1.6,13H240.8z M185.5,281.9h-29.1l9.4-11.7l0.1-0.1l0.1-0.1l19.5-25.1l19.5,25.1l0.1,0.1l0.1,0.1l9.4,11.7H185.5z'

type Props = {
  /** Icon height in px — text scales proportionally */
  size?: number
  /** Light ink on dark surface vs dark ink on light surface */
  onDark?: boolean
}

export function QSWordmark({ size = 44, onDark = false }: Props) {
  const fg = onDark ? '#FAFAF7' : '#0A0E14'
  const bg = onDark ? '#0A0E14' : '#FAFAF7'
  const fontSize = size * 0.5
  const indentLeft = Math.round(fontSize * 0.73)

  return (
    <View style={styles.wrap}>
      {/* Q icon mark */}
      <Svg width={size} height={size} viewBox="0 0 392 391.3">
        <Path fill={fg} d={QS_OUTER} />
        <Path fill={bg} d={QS_INNER} />
      </Svg>

      {/* Text lockup: "UANTUM / SIMPLEX" */}
      <View style={styles.textCol}>
        {/* Row 1: UANTUM — shifts down to align baseline with top of icon */}
        <View style={{ transform: [{ translateY: fontSize * 0.35 }] }}>
          <Text
            style={[styles.momcake, { fontSize, color: fg, letterSpacing: fontSize * 0.06, lineHeight: fontSize * 0.78 }]}
            allowFontScaling={false}
          >
            UANTUM
          </Text>
        </View>

        {/* Row 2: indented SIMPLE + X */}
        <View style={{ paddingLeft: indentLeft }}>
          <Text allowFontScaling={false} style={{ lineHeight: fontSize * 0.78 }}>
            <Text style={[styles.momcake, { fontSize, color: fg, letterSpacing: fontSize * 0.06 }]}>
              SIMPLE
            </Text>
            <Text style={[styles.bourbon, { fontSize: fontSize * 1.27, color: fg, letterSpacing: 0.8 }]}>
              X
            </Text>
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 1, flexShrink: 0 },
  textCol: { flexDirection: 'column', gap: 0 },
  momcake: { fontFamily: 'MOMCAKE-Bold', fontWeight: '700' },
  bourbon: { fontFamily: 'BourbonGrotesque' },
})
