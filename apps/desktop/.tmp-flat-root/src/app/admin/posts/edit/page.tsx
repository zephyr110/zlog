"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PostEditor } from "@/components/admin/post-editor"
import { apiFetch } from "@/lib/api-client"
import { Spinner } from "@/components/ui/spinner"
import { type Post } from "@zlog/database"

function EditPostContent() {
  const searchParams = useSearchParams()
  const slug = searchParams?.get("slug")
  const router = useRouter()
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) {
      router.push("/admin/posts")
      return
    }

    async function fetchPost() {
      try {
        const res = await apiFetch(`/api/posts?slug=${slug}`)
        if (res.ok) {
          const data = await res.json()
          setPost(data.post)
        } else {
          router.push("/admin/posts")
        }
      } catch {
        router.push("/admin/posts")
      } finally {
        setLoading(false)
      }
    }

    fetchPost()
  }, [slug, router])

  if (loading) {
    return (
      <Spinner
        size="lg"
        fill
        className="min-h-[calc(100vh-3.5rem-4rem)]"
      />
    )
  }

  if (!post) return null

  return <PostEditor initialPost={post} />
}

export default function EditPostPage() {
  return (
    <Suspense
      fallback={
        <Spinner
          size="lg"
          fill
          className="min-h-[calc(100vh-3.5rem-4rem)]"
        />
      }
    >
      <EditPostContent />
    </Suspense>
  )
}
