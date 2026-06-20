"use client"

import { useState } from "react"

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
    >
      {copied ? "Copied!" : label || "Copy URL"}
    </button>
  )
}

type QRCodeCardProps = {
  type: "Registration" | "Check-in" | "Evaluation"
  imageUrl: string
  formUrl: string
}

export function QRCodeCard({ type, imageUrl, formUrl }: QRCodeCardProps) {
  return (
    <div className="rounded-md border p-4 text-center space-y-3">
      <h3 className="text-sm font-medium">{type}</h3>
      <div className="flex justify-center">
        <img
          src={imageUrl}
          alt={`${type} QR code`}
          width={200}
          height={200}
          className="rounded"
        />
      </div>
      <div className="space-y-2">
        <div className="flex gap-2 justify-center">
          <a
            href={imageUrl}
            download={`${type.toLowerCase().replace("-", "")}-qr.png`}
            className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Download PNG
          </a>
          <CopyButton text={formUrl} />
        </div>
        <a
          href={formUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-muted-foreground hover:text-primary truncate"
          title={formUrl}
        >
          {formUrl}
        </a>
      </div>
    </div>
  )
}

export { CopyButton }
