'use client';

interface StepperProps {
  currentStep: number;
  steps: string[];
  accentColor?: 'red' | 'blue';
}

export default function Stepper({ currentStep, steps, accentColor = 'red' }: StepperProps) {
  const colors = {
    red: {
      active: 'border-[#EF4444]',
      completed: 'bg-[#EF4444]',
      text: 'text-[#F0F0F0]',
    },
    blue: {
      active: 'border-[#3B82F6]',
      completed: 'bg-[#3B82F6]',
      text: 'text-[#F0F0F0]',
    },
  };

  const color = colors[accentColor];

  return (
    <div className="flex items-center justify-center mb-10">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-2.5 h-2.5 rounded-full flex items-center justify-center transition-all duration-200 ${
                index < currentStep
                  ? color.completed
                  : index === currentStep
                  ? `bg-transparent border-2 ${color.active}`
                  : 'bg-[#27272A]'
              }`}
            >
              {index < currentStep && (
                <svg className="w-1.5 h-1.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span
              className={`mt-2.5 text-[0.8rem] font-medium transition-colors duration-200 ${
                index <= currentStep ? color.text : 'text-[#52525B]'
              }`}
            >
              {step}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className="w-16 h-px mx-3 bg-[#27272A]" />
          )}
        </div>
      ))}
    </div>
  );
}
