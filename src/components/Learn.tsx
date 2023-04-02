import React from 'react';

interface LearnProps {
    front: string;
    back: string;
}

const Learn: React.FC<LearnProps> = ({ front, back }) => {
    return (
        <div className="flex flex-col items-center justify-center space-y-4">
            <h2 className="text-2xl font-bold">Learn</h2>
            <div className="bg-blue-100 p-4 rounded">
                <div className="font-semibold">Front:</div>
                <div>{front}</div>
            </div>
            <div className="bg-blue-100 p-4 rounded">
                <div className="font-semibold">Back:</div>
                <div>{back}</div>
            </div>
        </div>
    );
};

export default Learn;
