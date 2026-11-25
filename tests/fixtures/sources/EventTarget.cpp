/*
 * Copyright (C) 1999 Lars Knoll (knoll@kde.org)
 * Copyright (C) 1999 Antti Koivisto (koivisto@kde.org)
 * Copyright (C) 2001 Dirk Mueller (mueller@kde.org)
 * Copyright (C) 2004-2023 Apple Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 */

#include "config.h"
#include "EventTarget.h"

namespace WebCore {

bool EventTarget::addEventListener(const AtomString& eventType, Ref<EventListener>&& listener, const AddEventListenerOptions& options)
{
    if (!isScriptExecutionContextValid())
        return false;

    bool listenerAdded = ensureEventTargetData().eventListenerMap.add(eventType, WTFMove(listener), {
        options.capture,
        options.passive,
        options.once
    });
    if (listenerAdded)
        eventListenersDidChange();
    return listenerAdded;
}

bool EventTarget::removeEventListener(const AtomString& eventType, EventListener& listener, const EventListenerOptions& options)
{
    auto* data = eventTargetData();
    if (!data)
        return false;

    bool listenerRemoved = data->eventListenerMap.remove(eventType, listener, options.capture);
    if (listenerRemoved)
        eventListenersDidChange();
    return listenerRemoved;
}

} // namespace WebCore
