/**
 * ESLint: require auditManufacturing / logAuditFromRequest before ok()/created()
 * in branches guarded by req.method === POST | PATCH | DELETE.
 */

function isReqMethodMember(node) {
  return (
    node &&
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object?.type === 'Identifier' &&
    node.object.name === 'req' &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'method'
  )
}

function extractReqMethodLiteral(test) {
  if (!test) return null
  if (test.type === 'BinaryExpression' && test.operator === '===') {
    if (isReqMethodMember(test.left) && test.right?.type === 'Literal' && typeof test.right.value === 'string') {
      return test.right.value
    }
    if (isReqMethodMember(test.right) && test.left?.type === 'Literal' && typeof test.left.value === 'string') {
      return test.left.value
    }
  }
  if (test.type === 'LogicalExpression' && (test.operator === '&&' || test.operator === '||')) {
    return extractReqMethodLiteral(test.left) || extractReqMethodLiteral(test.right)
  }
  return null
}

function referencesReqMethod(test) {
  if (!test) return false
  if (isReqMethodMember(test)) return true
  if (test.type === 'BinaryExpression') {
    return referencesReqMethod(test.left) || referencesReqMethod(test.right)
  }
  if (test.type === 'LogicalExpression') {
    return referencesReqMethod(test.left) || referencesReqMethod(test.right)
  }
  return false
}

function isUnderBranch(returnNode, branchRoot) {
  if (!branchRoot) return false
  if (returnNode === branchRoot) return true
  let p = returnNode.parent
  while (p) {
    if (p === branchRoot) return true
    p = p.parent
  }
  return false
}

function findMutationIfForReturn(returnNode, sourceCode) {
  const ancestors = sourceCode.getAncestors(returnNode)
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i]
    if (a.type !== 'IfStatement' || !referencesReqMethod(a.test)) continue
    const underCons = isUnderBranch(returnNode, a.consequent)
    const underAlt = a.alternate && isUnderBranch(returnNode, a.alternate)
    if (!underCons && !underAlt) continue

    const method = extractReqMethodLiteral(a.test)
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return null
    }
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE' || method === 'PUT') {
      return a
    }
  }
  return null
}

function textSliceForAudit(mutationIf, returnNode, branch, sourceCode) {
  const fullText = sourceCode.getText()
  const unbracedReturn =
    returnNode === mutationIf.consequent || returnNode === mutationIf.alternate
  if (unbracedReturn) {
    const parent = mutationIf.parent
    if (parent?.type === 'BlockStatement' && parent.range) {
      return fullText.slice(parent.range[0], returnNode.range[0])
    }
    return fullText.slice(mutationIf.range[0], returnNode.range[0])
  }
  if (!branch?.range) return ''
  return fullText.slice(branch.range[0], returnNode.range[0])
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require auditManufacturing() or logAuditFromRequest() before ok()/created() in req.method mutation handlers'
    },
    schema: [],
    messages: {
      missingAudit:
        'Mutation success response must be preceded by auditManufacturing() or logAuditFromRequest() in this branch (see api/_lib/manufacturingAuditLog.js and .cursorrules).'
    }
  },

  create(context) {
    const sourceCode = context.sourceCode

    return {
      ReturnStatement(node) {
        const arg = node.argument
        if (!arg || arg.type !== 'CallExpression') return
        const callee = arg.callee
        if (callee.type !== 'Identifier' || (callee.name !== 'ok' && callee.name !== 'created')) return
        const args = arg.arguments
        if (!args.length || args[0].type !== 'Identifier' || args[0].name !== 'res') return

        const mutationIf = findMutationIfForReturn(node, sourceCode)
        if (!mutationIf) return

        const branch = isUnderBranch(node, mutationIf.consequent) ? mutationIf.consequent : mutationIf.alternate
        const slice = textSliceForAudit(mutationIf, node, branch, sourceCode)
        if (/\bauditManufacturing\s*\(/.test(slice) || /\blogAuditFromRequest\s*\(/.test(slice)) {
          return
        }

        context.report({ node, messageId: 'missingAudit' })
      }
    }
  }
}

export default {
  rules: {
    'require-audit-before-mutation-success': rule
  }
}
