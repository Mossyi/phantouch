import React from 'react';

export const TavernAvatar: React.FC<{ avatar: string; name: string }> = React.memo(({ avatar, name }) => {
  const isImage = /^(?:https:|data:image\/)/i.test(avatar);
  return isImage
    ? <img src={avatar} alt={name} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
    : <span>{avatar}</span>;
});
