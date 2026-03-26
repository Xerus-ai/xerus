import { redirect } from 'next/navigation'

export default async function SkillSingularRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/skills/${slug}`)
}
