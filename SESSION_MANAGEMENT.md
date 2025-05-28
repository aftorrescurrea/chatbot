# Session Management Documentation

## Overview

The chatbot now includes comprehensive session management functionality that automatically handles user sessions with configurable timeout periods. When a chat ends or a user is inactive for a specified period, the session is automatically closed with appropriate notifications.

## Features

### 1. Automatic Session Timeout
- Sessions automatically close after a configurable period of inactivity
- Default timeout: 3 minutes (configurable via `SESSION_TIMEOUT_MINUTES` in `.env`)
- Users receive a notification when their session expires due to inactivity

### 2. Session Closure on Conversation End
The system automatically detects and closes sessions when:
- Trial credentials are successfully delivered
- User says goodbye (detected via 'despedida' intent)
- User cancels the process (detected via 'cancelacion' intent)
- Bot response contains finalization keywords

### 3. Session State Tracking
- Active sessions are tracked in memory
- Each session maintains:
  - Start time
  - Last activity time
  - Associated WhatsApp client
  - Time remaining before timeout

### 4. Graceful Notifications
Users receive clear notifications when sessions close:
- **Timeout notification**: Informs user their session closed due to inactivity
- **Normal closure notification**: Confirms session ended successfully with reason

## Configuration

Add the following to your `.env` file:

```env
# Session timeout in minutes (default: 3)
SESSION_TIMEOUT_MINUTES=3
```

## Implementation Details

### Session Service (`src/services/sessionService.js`)
The core session management service handles:
- Session lifecycle (start, update, close)
- Timeout timer management
- Session cleanup and memory management
- Statistics and monitoring

### Key Functions:
- `startOrUpdateSession(phoneNumber, client)`: Creates or updates a session
- `closeSession(phoneNumber, client, reason)`: Manually closes a session
- `closeSessionDueToTimeout(phoneNumber)`: Handles timeout closures
- `cleanupSession(phoneNumber)`: Cleans all session-related data

### Integration with Message Controller
The message controller (`src/controllers/messageController.js`) integrates session management:
1. Updates session on each message received
2. Checks if session should close after processing
3. Handles session cleanup on conversation end

### Session Closure Detection
The `checkIfShouldCloseSession` function detects when to close sessions based on:
- Flow completion (e.g., credentials delivered)
- User intents (goodbye, cancellation)
- Response content analysis

## Monitoring

### System Statistics
The system logs include session information:
```
📊 === ESTADÍSTICAS DEL SISTEMA ===
👥 Sesiones activas: 2 (timeout: 3 min)
👥 Sesiones activas:
   - +5491234...: activa por 2min, timeout en 1min
   - +5495678...: activa por 0min, timeout en 3min
```

### Session Lifecycle Events
All session events are logged:
- Session creation/update
- Timeout warnings
- Session closures with reasons
- Cleanup operations

## Example Session Flow

1. **User starts conversation**
   - Session created with 3-minute timeout
   - Timer starts counting

2. **User interacts**
   - Each message resets the timeout timer
   - Session remains active

3. **Session ends (multiple scenarios)**:
   
   **Scenario A - Natural completion:**
   - User completes trial request
   - Credentials delivered
   - Session closed with success message
   
   **Scenario B - User goodbye:**
   - User says "gracias, adiós"
   - Goodbye intent detected
   - Session closed with farewell message
   
   **Scenario C - Timeout:**
   - User stops responding for 3 minutes
   - Timeout triggered
   - Session closed with timeout notification

## Error Handling

- Sessions are properly cleaned up even on errors
- Graceful shutdown stops all timers
- Periodic cleanup removes orphaned sessions
- Memory leaks prevented through proper cleanup

## Testing Session Management

To test the session management:

1. **Test timeout**:
   - Send a message to start a session
   - Wait for the configured timeout period
   - Verify timeout notification is received

2. **Test normal closure**:
   - Complete a trial request flow
   - Verify session closes after credentials delivery

3. **Test goodbye detection**:
   - Send "gracias, hasta luego"
   - Verify session closes with farewell message

4. **Test session reset**:
   - Send messages intermittently
   - Verify timeout resets with each message

## Best Practices

1. **Configure appropriate timeout**: Balance between user convenience and resource usage
2. **Monitor active sessions**: Use system statistics to track session usage
3. **Handle edge cases**: Ensure proper cleanup on errors or disconnections
4. **Test thoroughly**: Verify all closure scenarios work correctly

## Troubleshooting

### Sessions not timing out
- Check `SESSION_TIMEOUT_MINUTES` is properly set in `.env`
- Verify timer creation in logs
- Check for errors in periodic cleanup

### Sessions closing unexpectedly
- Review closure detection logic
- Check for false positive intent detection
- Verify response content doesn't contain closure keywords

### Memory issues
- Monitor active session count
- Ensure periodic cleanup is running
- Check for proper session cleanup on closure