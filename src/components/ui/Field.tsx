import React from 'react';

interface FieldProps {
    label: React.ReactNode;
    htmlFor?: string;
    hint?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

const Field: React.FC<FieldProps> = ({ label, htmlFor, hint, children, className = '' }) => (
    <div className={`flex w-full flex-col gap-1.5 ${className}`}>
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-gray-900">
            {label}
        </label>
        {children}
        {hint && <p className="m-0 text-xs leading-snug text-gray-500">{hint}</p>}
    </div>
);

export default Field;
