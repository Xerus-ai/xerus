import { redirect } from 'next/navigation'

export default function ModelsRedirect() {
  redirect('/settings/api-keys')
}
