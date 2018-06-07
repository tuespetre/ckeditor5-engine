import InsertOperation from './insertoperation';
import AttributeOperation from './attributeoperation';
import RenameOperation from './renameoperation';
import MarkerOperation from './markeroperation';
import MoveOperation from './moveoperation';
import RemoveOperation from './removeoperation';
import ReinsertOperation from './reinsertoperation';
import MergeOperation from './mergeoperation';
import SplitOperation from './splitoperation';
import WrapOperation from './wrapoperation';
import UnwrapOperation from './unwrapoperation';
import NoOperation from './nooperation';
import Range from '../range';
import compareArrays from '@ckeditor/ckeditor5-utils/src/comparearrays';

const transformations = new Map();

export function setTransformation( OperationA, OperationB, transformationFunction ) {
	let aGroup = transformations.get( OperationA );

	if ( !aGroup ) {
		aGroup = new Map();
		transformations.set( OperationA, aGroup );
	}

	aGroup.set( OperationB, transformationFunction );
}

function getTransformation( a, b ) {
	const OperationA = a.constructor;
	const OperationB = b.constructor;

	const aGroups = new Set();

	let aGroup = transformations.get( OperationA );

	if ( aGroup ) {
		aGroups.add( aGroup );
	}

	for ( const Operation of transformations.keys() ) {
		if ( a instanceof Operation ) {
			aGroups.add( transformations.get( Operation ) );
		}
	}

	for ( const group of aGroups ) {
		if ( group.has( OperationB ) ) {
			return group.get( OperationB );
		}

		for ( const Operation of group.keys() ) {
			if ( b instanceof Operation ) {
				return group.get( Operation );
			}
		}
	}

	return noUpdateTransformation;
}

function noUpdateTransformation( a ) {
	return [ a.clone() ];
}

function updateBaseVersions( operations, baseVersion ) {
	for ( const operation of operations ) {
		operation.baseVersion = baseVersion++;
	}

	return operations;
}

function transform( a, b, context ) {
	const transformationFunction = getTransformation( a, b );

	const aTransformed = transformationFunction( a.clone(), b, context );

	return updateBaseVersions( aTransformed, b.baseVersion );
}

export default transform;

function getNoOp() {
	return [ new NoOperation( 0 ) ];
}

// -----------------------

setTransformation( AttributeOperation, AttributeOperation, ( a, b, context ) => {
	if ( a.key === b.key ) {
		// If operations attributes are in conflict, check if their ranges intersect and manage them properly.

		// First, we want to apply change to the part of a range that has not been changed by the other operation.
		const operations = a.range.getDifference( b.range ).map( range => {
			return new AttributeOperation( range, a.key, a.oldValue, a.newValue, a.baseVersion );
		} );

		// Then we take care of the common part of ranges.
		const common = a.range.getIntersection( b.range );

		if ( common ) {
			// If this operation is more important, we also want to apply change to the part of the
			// original range that has already been changed by the other operation. Since that range
			// got changed we also have to update `oldValue`.
			if ( context.isStrong ) {
				operations.push( new AttributeOperation( common, b.key, b.newValue, a.newValue, a.baseVersion ) );
			} else if ( operations.length === 0 ) {
				operations.push( new NoOperation( 0 ) );
			}
		}

		return operations;
	} else {
		// If operations don't conflict, simply return an array containing just a clone of this operation.
		return [ a ];
	}
} );

setTransformation( AttributeOperation, InsertOperation, ( a, b ) => {
	// Transform this operation's range.
	// in old transformations there were an additional attribute operation, maybe it is needed
	const ranges = a.range._getTransformedByInsertion( b.position, b.howMany, !b.shouldReceiveAttributes );

	// Map transformed range(s) to operations and return them.
	// not sure why or if the reverse is needed here
	return ranges.reverse().map( range => {
		return new AttributeOperation( range, a.key, a.oldValue, a.newValue, a.baseVersion );
	} );
} );

setTransformation( AttributeOperation, MergeOperation, ( a, b ) => {
	// probably should prevent adding attributes on wrong nodes
	// maybe attribute ranges should be flat too?
	a.range = a.range._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( AttributeOperation, MoveOperation, ( a, b ) => {
	const ranges = a.range._getTransformedByMoveOperation( b, false );

	// Map transformed range(s) to operations and return them.
	return ranges.map( range => {
		return new AttributeOperation( range, a.key, a.oldValue, a.newValue, a.baseVersion );
	} );
} );

setTransformation( AttributeOperation, SplitOperation, ( a, b ) => {
	// probably should prevent adding attributes on wrong nodes
	// if changed node is split, changed both nodes
	a.range = a.range._getTransformedBySplitOperation( b );

	return [ a ];
} );

setTransformation( AttributeOperation, WrapOperation, ( a, b ) => {
	// probably should prevent adding attributes on wrong nodes
	a.range = a.range._getTransformedByWrapOperation( b );

	return [ a ];
} );

setTransformation( AttributeOperation, UnwrapOperation, ( a, b ) => {
	a.range = a.range._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// -----------------------

setTransformation( InsertOperation, AttributeOperation, ( a, b ) => {
	const result = [ a ];

	if ( a.shouldReceiveAttributes && b.range.containsPosition( a.position ) ) {
		const insertedRange = Range.createFromPositionAndShift( a.position, a.howMany );

		result.push(
			new AttributeOperation( insertedRange, b.key, b.oldValue, b.newValue, 0 )
		);
	}

	return result;
} );

setTransformation( InsertOperation, InsertOperation, ( a, b, context ) => {
	a.position = a.position._getTransformedByInsertOperation( b /*, ???*/ ); // needs insert before

	return [ a ];
} );

setTransformation( InsertOperation, MoveOperation, ( a, b, context ) => {
	a.position = a.position._getTransformedByMoveOperation( b, false /*, ???*/ ); // needs insert before

	return [ a ];
} );

setTransformation( InsertOperation, SplitOperation, ( a, b ) => {
	a.position = a.position._getTransformedBySplitOperation( b );

	return [ a ];
} );

setTransformation( InsertOperation, MergeOperation, ( a, b ) => {
	a.position = a.position._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( InsertOperation, WrapOperation, ( a, b ) => {
	a.position = a.position._getTransformedByWrapOperation( b );

	return [ a ];
} );

setTransformation( InsertOperation, UnwrapOperation, ( a, b ) => {
	a.position = a.position._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// -----------------------

setTransformation( MarkerOperation, InsertOperation, ( a, b ) => {
	if ( a.oldRange ) {
		a.oldRange = a.oldRange._getTransformedByInsertOperation( b );
	}

	if ( a.newRange ) {
		a.newRange = a.newRange._getTransformedByInsertOperation( b );
	}

	return [ a ];
} );

setTransformation( MarkerOperation, MarkerOperation, ( a, b, context ) => {
	if ( a.name == b.name ) {
		if ( context.isStrong ) {
			a.oldRange = Range.createFromRange( b.newRange );
		} else {
			// NoOp.
			a.newRange = Range.createFromRange( b.newRange );
		}
	}

	return [ a ];
} );

setTransformation( MarkerOperation, MergeOperation, ( a, b ) => {
	if ( a.oldRange ) {
		a.oldRange = a.oldRange._getTransformedByMergeOperation( b );
	}

	if ( a.newRange ) {
		a.newRange = a.newRange._getTransformedByMergeOperation( b );
	}

	return [ a ];
} );

setTransformation( MarkerOperation, MoveOperation, ( a, b ) => {
	if ( a.oldRange ) {
		a.oldRange = Range.createFromRanges( a.oldRange._getTransformedByMoveOperation( b, true ) );
	}

	if ( a.newRange ) {
		a.newRange = Range.createFromRanges( a.newRange._getTransformedByMoveOperation( b, true ) );
	}

	return [ a ];
} );

setTransformation( MarkerOperation, SplitOperation, ( a, b ) => {
	if ( a.oldRange ) {
		a.oldRange = a.oldRange._getTransformedBySplitOperation( b );
	}

	if ( a.newRange ) {
		a.newRange = a.newRange._getTransformedBySplitOperation( b );
	}

	return [ a ];
} );

setTransformation( MarkerOperation, WrapOperation, ( a, b ) => {
	if ( a.oldRange ) {
		a.oldRange = a.oldRange._getTransformedByWrapOperation( b );
	}

	if ( a.newRange ) {
		a.newRange = a.newRange._getTransformedByWrapOperation( b );
	}

	return [ a ];
} );

setTransformation( MarkerOperation, UnwrapOperation, ( a, b ) => {
	if ( a.oldRange ) {
		a.oldRange = a.oldRange._getTransformedByUnwrapOperation( b );
	}

	if ( a.newRange ) {
		a.newRange = a.newRange._getTransformedByUnwrapOperation( b );
	}

	return [ a ];
} );

// -----------------------

setTransformation( MergeOperation, InsertOperation, ( a, b ) => {
	a.sourcePosition = a.sourcePosition._getTransformedByInsertOperation( b );
	a.targetPosition = a.targetPosition._getTransformedByInsertOperation( b );

	return [ a ];
} );

setTransformation( MergeOperation, MergeOperation, ( a, b ) => {
	// same merge source and target position -- no op
	// same merge source position different target position special case -- only one merge applies use is strong

	a.sourcePosition = a.sourcePosition._getTransformedByMergeOperation( b );
	a.targetPosition = a.targetPosition._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( MergeOperation, MoveOperation, ( a, b ) => {
	// remove special case -- if right-side merge was removed, dont bring it back

	a.sourcePosition = a.sourcePosition._getTransformedByMoveOperation( b );
	a.targetPosition = a.targetPosition._getTransformedByMoveOperation( b );

	return [ a ];
} );

setTransformation( MergeOperation, SplitOperation, ( a, b ) => {
	a.sourcePosition = a.sourcePosition._getTransformedBySplitOperation( b );
	a.targetPosition = a.targetPosition._getTransformedBySplitOperation( b );

	return [ a ];
} );

setTransformation( MergeOperation, WrapOperation, ( a, b ) => {
	// what about a case when sourceposition parent is wrapped?

	a.sourcePosition = a.sourcePosition._getTransformedByWrapOperation( b );
	a.targetPosition = a.targetPosition._getTransformedByWrapOperation( b );

	return [ a ];
} );

setTransformation( MergeOperation, UnwrapOperation, ( a, b ) => {
	// shouldnt be possible to merge unwrapped element or to unwrapped element?

	a.sourcePosition = a.sourcePosition._getTransformedByUnwrapOperation( b );
	a.targetPosition = a.targetPosition._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// -----------------------

setTransformation( MoveOperation, InsertOperation, ( a, b, context ) => {
	const moveRange = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );
	const transformed = moveRange._getTransformedByInsertOperation( b, false );

	a.sourcePosition = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;
	a.targetPosition = a.targetPosition._getTransformedByInsertOperation( b /*, ???*/ ); // needs insert before ?
} );

setTransformation( MoveOperation, MoveOperation, ( a, b, context ) => {
	// research this again
	//
	// Setting and evaluating some variables that will be used in special cases and default algorithm.
	//
	// Create ranges from `MoveOperations` properties.
	const rangeA = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );
	const rangeB = Range.createFromPositionAndShift( b.sourcePosition, b.howMany );

	// Assign `context.isStrong` to a different variable, because the value may change during execution of
	// this algorithm and we do not want to override original `context.isStrong` that will be used in later transformations.
	let isStrong = context.isStrong;

	// Whether range moved by operation `b` is includable in operation `a` move range.
	// For this, `a` operation has to be sticky (so `b` sticks to the range) and context has to allow stickiness.
	const includeB = a.isSticky && !context.forceNotSticky;

	// Evaluate new target position for transformed operation.
	// Check whether there is a forced order of nodes or use `isStrong` flag for conflict resolving.
	const insertBefore = context.insertBefore === undefined ? !isStrong : context.insertBefore;

	// `a.targetPosition` could be affected by the `b` operation. We will transform it.
	const newTargetPosition = a.targetPosition._getTransformedByMove(
		b.sourcePosition,
		b.targetPosition,
		b.howMany,
		insertBefore,
		b.isSticky && !context.forceNotSticky
	);

	//
	// Special case #1 + mirror.
	//
	// Special case when both move operations' target positions are inside nodes that are
	// being moved by the other move operation. So in other words, we move ranges into inside of each other.
	// This case can't be solved reasonably (on the other hand, it should not happen often).
	if ( moveTargetIntoMovedRange( a, b ) && moveTargetIntoMovedRange( b, a ) ) {
		// Instead of transforming operation, we return a reverse of the operation that we transform by.
		// So when the results of this "transformation" will be applied, `b` MoveOperation will get reversed.
		return [ b.getReversed() ];
	}
	//
	// End of special case #1.
	//

	//
	// Special case #2.
	//
	// Check if `b` operation targets inside `rangeA`. Use stickiness if possible.
	const bTargetsToA = rangeA.containsPosition( b.targetPosition ) ||
		( rangeA.start.isEqual( b.targetPosition ) && includeB ) ||
		( rangeA.end.isEqual( b.targetPosition ) && includeB );

	// If `b` targets to `rangeA` and `rangeA` contains `rangeB`, `b` operation has no influence on `a` operation.
	// You might say that operation `b` is captured inside operation `a`.
	if ( bTargetsToA && rangeA.containsRange( rangeB, true ) ) {
		// There is a mini-special case here, where `rangeB` is on other level than `rangeA`. That's why
		// we need to transform `a` operation anyway.
		rangeA.start = rangeA.start._getTransformedByMove( b.sourcePosition, b.targetPosition, b.howMany, !includeB );
		rangeA.end = rangeA.end._getTransformedByMove( b.sourcePosition, b.targetPosition, b.howMany, includeB );

		return makeMoveOperationsFromRanges( [ rangeA ], newTargetPosition, a );
	}

	//
	// Special case #2 mirror.
	//
	const aTargetsToB = rangeB.containsPosition( a.targetPosition ) ||
		( rangeB.start.isEqual( a.targetPosition ) && b.isSticky && !context.forceNotSticky ) ||
		( rangeB.end.isEqual( a.targetPosition ) && b.isSticky && !context.forceNotSticky );

	if ( aTargetsToB && rangeB.containsRange( rangeA, true ) ) {
		// `a` operation is "moved together" with `b` operation.
		// Here, just move `rangeA` "inside" `rangeB`.
		rangeA.start = rangeA.start._getCombined( b.sourcePosition, b.getMovedRangeStart() );
		rangeA.end = rangeA.end._getCombined( b.sourcePosition, b.getMovedRangeStart() );

		return makeMoveOperationsFromRanges( [ rangeA ], newTargetPosition, a );
	}
	//
	// End of special case #2.
	//

	//
	// Special case #3 + mirror.
	//
	// `rangeA` has a node which is an ancestor of `rangeB`. In other words, `rangeB` is inside `rangeA`
	// but not on the same tree level. In such case ranges have common part but we have to treat it
	// differently, because in such case those ranges are not really conflicting and should be treated like
	// two separate ranges. Also we have to discard two difference parts.
	const aCompB = compareArrays( a.sourcePosition.getParentPath(), b.sourcePosition.getParentPath() );

	if ( aCompB == 'prefix' || aCompB == 'extension' ) {
		// Transform `rangeA` by `b` operation and make operation out of it, and that's all.
		// Note that this is a simplified version of default case, but here we treat the common part (whole `rangeA`)
		// like a one difference part.
		rangeA.start = rangeA.start._getTransformedByMove( b.sourcePosition, b.targetPosition, b.howMany, !includeB );
		rangeA.end = rangeA.end._getTransformedByMove( b.sourcePosition, b.targetPosition, b.howMany, includeB );

		return makeMoveOperationsFromRanges( [ rangeA ], newTargetPosition, a );
	}
	//
	// End of special case #3.
	//

	//
	// Default case - ranges are on the same level or are not connected with each other.
	//
	// Modifier for default case.
	// Modifies `isStrong` flag in certain conditions.
	//
	// If only one of operations is a remove operation, we force remove operation to be the "stronger" one
	// to provide more expected results. This is done only if `context.forceWeakRemove` is set to `false`.
	// `context.forceWeakRemove` is set to `true` in certain conditions when transformation takes place during undo.
	if ( !context.forceWeakRemove ) {
		if ( a instanceof RemoveOperation && !( b instanceof RemoveOperation ) ) {
			isStrong = true;
		} else if ( !( a instanceof RemoveOperation ) && b instanceof RemoveOperation ) {
			isStrong = false;
		}
	}

	// Handle operation's source ranges - check how `rangeA` is affected by `b` operation.
	// This will aggregate transformed ranges.
	const ranges = [];

	// Get the "difference part" of `a` operation source range.
	// This is an array with one or two ranges. Two ranges if `rangeB` is inside `rangeA`.
	const difference = rangeA.getDifference( rangeB );

	for ( const range of difference ) {
		// Transform those ranges by `b` operation. For example if `b` moved range from before those ranges, fix those ranges.
		range.start = range.start._getTransformedByDeletion( b.sourcePosition, b.howMany );
		range.end = range.end._getTransformedByDeletion( b.sourcePosition, b.howMany );

		// If `b` operation targets into `rangeA` on the same level, spread `rangeA` into two ranges.
		const shouldSpread = compareArrays( range.start.getParentPath(), b.getMovedRangeStart().getParentPath() ) == 'same';
		const newRanges = range._getTransformedByInsertion( b.getMovedRangeStart(), b.howMany, shouldSpread, includeB );

		ranges.push( ...newRanges );
	}

	// Then, we have to manage the "common part" of both move ranges.
	const common = rangeA.getIntersection( rangeB );

	if ( common !== null && isStrong && !bTargetsToA ) {
		// Calculate the new position of that part of original range.
		common.start = common.start._getCombined( b.sourcePosition, b.getMovedRangeStart() );
		common.end = common.end._getCombined( b.sourcePosition, b.getMovedRangeStart() );

		// Take care of proper range order.
		//
		// Put `common` at appropriate place. Keep in mind that we are interested in original order.
		// Basically there are only three cases: there is zero, one or two difference ranges.
		//
		// If there is zero difference ranges, just push `common` in the array.
		if ( ranges.length === 0 ) {
			ranges.push( common );
		}
		// If there is one difference range, we need to check whether common part was before it or after it.
		else if ( ranges.length == 1 ) {
			if ( rangeB.start.isBefore( rangeA.start ) || rangeB.start.isEqual( rangeA.start ) ) {
				ranges.unshift( common );
			} else {
				ranges.push( common );
			}
		}
		// If there are more ranges (which means two), put common part between them. This is the only scenario
		// where there could be two difference ranges so we don't have to make any comparisons.
		else {
			ranges.splice( 1, 0, common );
		}
	}

	if ( ranges.length === 0 ) {
		// If there are no "source ranges", nothing should be changed.
		// Note that this can happen only if `isStrong == false` and `rangeA.isEqual( rangeB )`.
		return [ new NoOperation( a.baseVersion ) ];
	}

	return makeMoveOperationsFromRanges( ranges, newTargetPosition, a );
} );

setTransformation( MoveOperation, SplitOperation, ( a, b ) => {
	// needs preventing from creating non-flat ranges
	// what if split removed

	const moveRange = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );
	const transformed = moveRange._getTransformedBySplitOperation( b );

	a.sourcePosition = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;
	a.targetPosition = a.targetPosition._getTransformedBySplitOperation( b );

	return [ a ];
} );

setTransformation( MoveOperation, MergeOperation, ( a, b ) => {
	const moveRange = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );
	const transformed = moveRange._getTransformedByMergeOperation( b );

	a.sourcePosition = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;
	a.targetPosition = a.targetPosition._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

setTransformation( MoveOperation, WrapOperation, ( a, b ) => {
	// needs preventing from creating non-flat ranges

	const moveRange = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );
	const transformed = moveRange._getTransformedByWrapOperation( b );

	a.sourcePosition = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;
	a.targetPosition = a.targetPosition._getTransformedByWrapOperation( b );

	return [ a ];
} );

setTransformation( MoveOperation, UnwrapOperation, ( a, b ) => {
	const moveRange = Range.createFromPositionAndShift( a.sourcePosition, a.howMany );
	const transformed = moveRange._getTransformedByUnwrapOperation( b );

	a.sourcePosition = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;
	a.targetPosition = a.targetPosition._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// -----------------------

setTransformation( RenameOperation, InsertOperation, ( a, b ) => {
	a.position = a.position._getTransformedByInsertOperation( b );

	return [ a ];
} );

setTransformation( RenameOperation, MergeOperation, ( a, b ) => {
	a.position = a.position._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( RenameOperation, MoveOperation, ( a, b ) => {
	a.position = a.position._getTransformedByMoveOperation( b );

	return [ a ];
} );

setTransformation( RenameOperation, RenameOperation, ( a, b, context ) => {
	if ( a.position.isEqual( b.position ) ) {
		if ( context.isStrong ) {
			a.oldName = b.newName;
		} else {
			// NoOp.
			a.newName = b.newName;
		}
	}

	return [ a ];
} );

setTransformation( RenameOperation, SplitOperation, ( a, b ) => {
	// if split node is renamed, rename both

	a.position = a.position._getTransformedBySplitOperation( b );

	return [ a ];
} );

setTransformation( RenameOperation, MergeOperation, ( a, b ) => {
	// if merge node is renamed, cancel rename (?)

	a.position = a.position._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( RenameOperation, WrapOperation, ( a, b ) => {
	a.position = a.position._getTransformedByWrapOperation( b );

	return [ a ];
} );

setTransformation( RenameOperation, UnwrapOperation, ( a, b ) => {
	// if unwrapped node is renamed, cancel rename (?)
	a.position = a.position._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// -----------------------

setTransformation( SplitOperation, InsertOperation, ( a, b ) => {
	a.position = a.position._getTransformedByInsertOperation( b );

	return [ a ];
} );

setTransformation( SplitOperation, MergeOperation, ( a, b ) => {
	a.position = a.position._getTransformedByMergeOperation( b );

	return [ a ];
} );

setTransformation( SplitOperation, MoveOperation, ( a, b ) => {
	// what if split position is moved? or removed
	a.position = a.position._getTransformedByMoveOperation( b );

	return [ a ];
} );

setTransformation( SplitOperation, SplitOperation, ( a, b ) => {
	if ( a.position.isEqual( b.position ) ) {
		// could possible be a noop but then it screws up ot
	}

	a.position = a.position._getTransformedBySplitOperation( b );

	return [ a ];
} );

setTransformation( SplitOperation, WrapOperation, ( a, b ) => {
	// cancel split if nodes got wrapped

	a.position = a.position._getTransformedByWrapOperation( b );

	return [ a ];
} );

setTransformation( SplitOperation, UnwrapOperation, ( a, b ) => {
	// cancel split if element got unwrapped

	a.position = a.position._getTransformedByUnwrapOperation( b );

	return [ a ];
} );

// -----------------------

setTransformation( WrapOperation, InsertOperation, ( a, b ) => {
	const transformed = a.wrappedRange._getTransformedByInsertOperation( b, false );

	a.position = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( WrapOperation, MergeOperation, ( a, b ) => {
	const transformed = a.wrappedRange._getTransformedByMergeOperation( b );

	a.position = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( WrapOperation, MoveOperation, ( a, b ) => {
	// move contains some wrapped nodes: it should probably somehow use context + have a mirror scenario
	const transformed = a.wrappedRange._getTransformedByMoveOperation( b, false );
	const result = Range.createFromRanges( transformed ); // is this 100% correct

	a.position = result.start;
	a.howMany = result.end.offset - result.start.offset;

	return [ a ];
} );

setTransformation( WrapOperation, SplitOperation, ( a, b ) => {
	// cancel split if nodes got wrapped
	const transformed = a.wrappedRange._getTransformedBySplitOperation( b );

	a.position = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( WrapOperation, WrapOperation, ( a, b ) => {
	// what if ranges are intersecting on the same level
	const transformed = a.wrappedRange._getTransformedByWrapOperation( b );

	a.position = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( WrapOperation, UnwrapOperation, ( a, b ) => {
	const transformed = a.wrappedRange._getTransformedByUnwrapOperation( b );

	a.position = transformed.start;
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

// -----------------------

setTransformation( UnwrapOperation, InsertOperation, ( a, b ) => {
	// range will change a.position stickiness -- this sucks
	const transformed = a.unwrappedRange._getTransformedByInsertOperation( b, false );

	a.position = transformed.start;
	a.position.stickiness = 'toPrevious';
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( UnwrapOperation, MergeOperation, ( a, b ) => {
	// unwrap both nodes if node to unwrap got merged
	const transformed = a.unwrappedRange._getTransformedByMergeOperation( b );

	a.position = transformed.start;
	a.position.stickiness = 'toPrevious';
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( UnwrapOperation, MoveOperation, ( a, b ) => {
	const transformed = a.unwrappedRange._getTransformedByMoveOperation( b, false );
	const result = Range.createFromRanges( transformed ); // is this 100% correct?

	a.position = result.start;
	a.position.stickiness = 'toPrevious';
	a.howMany = result.end.offset - result.start.offset;

	return [ a ];
} );

setTransformation( UnwrapOperation, SplitOperation, ( a, b ) => {
	// cancel split if nodes got unwrapped or unwrap both
	const transformed = a.unwrappedRange._getTransformedBySplitOperation( b );

	a.position = transformed.start;
	a.position.stickiness = 'toPrevious';
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

setTransformation( UnwrapOperation, WrapOperation, ( a, b ) => {
	if ( a.position.isEqual( b.targetPosition ) ) {
		a.howMany += b.howMany;
	}

	a.position = a.position._getTransformedByWrapOperation( b );
	a.position.stickiness = 'toPrevious';

	return [ a ];
} );

setTransformation( UnwrapOperation, UnwrapOperation, ( a, b ) => {
	if ( a.position.isEqual( b.position ) ) {
		// NoOp.
		a.howMany = 0;

		return [ a ];
	}

	const transformed = a.unwrappedRange._getTransformedByUnwrapOperation( b );

	a.position = transformed.start;
	a.position.stickiness = 'toPrevious';
	a.howMany = transformed.end.offset - transformed.start.offset;

	return [ a ];
} );

// Checks whether MoveOperation targetPosition is inside a node from the moved range of the other MoveOperation.
function moveTargetIntoMovedRange( a, b ) {
	return a.targetPosition._getTransformedByDeletion( b.sourcePosition, b.howMany ) === null;
}

// Helper function for `MoveOperation` x `MoveOperation` transformation.
// Convert given ranges and target position to move operations and return them.
// Ranges and target position will be transformed on-the-fly when generating operations.
// Given `ranges` should be in the order of how they were in the original transformed operation.
// Given `targetPosition` is the target position of the first range from `ranges`.
function makeMoveOperationsFromRanges( ranges, targetPosition, a ) {
	// At this moment we have some ranges and a target position, to which those ranges should be moved.
	// Order in `ranges` array is the go-to order of after transformation.
	//
	// We are almost done. We have `ranges` and `targetPosition` to make operations from.
	// Unfortunately, those operations may affect each other. Precisely, first operation after move
	// may affect source range and target position of second and third operation. Same with second
	// operation affecting third.
	//
	// We need to fix those source ranges and target positions once again, before converting `ranges` to operations.
	const operations = [];

	// Keep in mind that nothing will be transformed if there is just one range in `ranges`.
	for ( let i = 0; i < ranges.length; i++ ) {
		// Create new operation out of a range and target position.
		const op = makeMoveOperation( ranges[ i ], targetPosition, a.isSticky );

		operations.push( op );

		// Transform other ranges by the generated operation.
		for ( let j = i + 1; j < ranges.length; j++ ) {
			// All ranges in `ranges` array should be:
			// * non-intersecting (these are part of original operation source range), and
			// * `targetPosition` does not target into them (opposite would mean that transformed operation targets "inside itself").
			//
			// This means that the transformation will be "clean" and always return one result.
			ranges[ j ] = ranges[ j ]._getTransformedByMove( op.sourcePosition, op.targetPosition, op.howMany )[ 0 ];
		}

		targetPosition = targetPosition._getTransformedByMove( op.sourcePosition, op.targetPosition, op.howMany, true, false );
	}

	return operations;
}

function makeMoveOperation( range, targetPosition, isSticky ) {
	// We want to keep correct operation class.
	let OperationClass;

	if ( targetPosition.root.rootName == '$graveyard' ) {
		OperationClass = RemoveOperation;
	} else if ( range.start.root.rootName == '$graveyard' ) {
		OperationClass = ReinsertOperation;
	} else {
		OperationClass = MoveOperation;
	}

	const result = new OperationClass(
		range.start,
		range.end.offset - range.start.offset,
		targetPosition,
		0 // Is corrected anyway later.
	);

	result.isSticky = isSticky;

	return result;
}