import { Linking } from 'react-native'

export const QS_WEBSITE_URL = 'https://quantum-simplex.vercel.app/'

export function openQSWebsite(): void {
  void Linking.openURL(QS_WEBSITE_URL)
}
