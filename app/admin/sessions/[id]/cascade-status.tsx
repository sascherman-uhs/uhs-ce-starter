type CascadeStatusProps = {
  cascade: Record<string, any>
  sessionId: string
}

const STEPS = [
  { key: "qr_codes", label: "QR Codes", description: "3 QR codes generated" },
  { key: "flyer", label: "Flyer", description: "PDF flyer generated" },
  { key: "email", label: "Coordinator Email", description: "Scheduling email sent" },
  { key: "calendar", label: "Google Calendar", description: "Calendar event created" },
  { key: "division_notice", label: "Division Notice", description: "Outlook draft to schedule-filing@your-state.gov" },
]

export function CascadeStatus({ cascade, sessionId }: CascadeStatusProps) {
  return (
    <div className="rounded-md border p-6 space-y-4">
      <h2 className="text-lg font-semibold">Scheduling Cascade</h2>
      <div className="space-y-3">
        {STEPS.map((step) => {
          const stepData = cascade[step.key] || {}
          const isComplete = !!stepData.completed_at
          return (
            <div key={step.key} className="flex items-center gap-3">
              <div
                className={`h-5 w-5 rounded-full flex items-center justify-center text-xs ${
                  isComplete
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {isComplete ? "\u2713" : "\u2022"}
              </div>
              <div>
                <div className="text-sm font-medium">{step.label}</div>
                <div className="text-xs text-muted-foreground">
                  {isComplete
                    ? `Completed ${new Date(stepData.completed_at).toLocaleString()}`
                    : step.description}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
