async function writeAudit(connection, actorId, action, entityType, entityId, beforeSummary, afterSummary, req) {
  await connection.execute(
    `INSERT INTO audit_logs
      (actor_user_id, action, entity_type, entity_id, before_summary, after_summary, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actorId || null,
      action,
      entityType,
      entityId || null,
      beforeSummary ? JSON.stringify(beforeSummary) : null,
      afterSummary ? JSON.stringify(afterSummary) : null,
      req?.ip || null,
      req?.headers?.['user-agent'] || null
    ]
  );
}

module.exports = { writeAudit };
