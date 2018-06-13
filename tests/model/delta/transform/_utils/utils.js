/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import Model from '../../../../../src/model/model';
import Element from '../../../../../src/model/element';
import Text from '../../../../../src/model/text';

import Position from '../../../../../src/model/position';
import Range from '../../../../../src/model/range';

import Batch from '../../../../../src/model/batch';

import AttributeDelta from '../../../../../src/model/delta/attributedelta';
import InsertDelta from '../../../../../src/model/delta/insertdelta';
import RenameDelta from '../../../../../src/model/delta/renamedelta';
import RemoveDelta from '../../../../../src/model/delta/removedelta';
import MarkerDelta from '../../../../../src/model/delta/markerdelta';
import MoveDelta from '../../../../../src/model/delta/movedelta';
import MergeDelta from '../../../../../src/model/delta/mergedelta';
import SplitDelta from '../../../../../src/model/delta/splitdelta';
import WrapDelta from '../../../../../src/model/delta/wrapdelta';
import UnwrapDelta from '../../../../../src/model/delta/unwrapdelta';

import AttributeOperation from '../../../../../src/model/operation/attributeoperation';
import InsertOperation from '../../../../../src/model/operation/insertoperation';
import MarkerOperation from '../../../../../src/model/operation/markeroperation';
import MoveOperation from '../../../../../src/model/operation/moveoperation';
import RemoveOperation from '../../../../../src/model/operation/removeoperation';
import RenameOperation from '../../../../../src/model/operation/renameoperation';
import MergeOperation from '../../../../../src/model/operation/mergeoperation';
import SplitOperation from '../../../../../src/model/operation/splitoperation';
import WrapOperation from '../../../../../src/model/operation/wrapoperation';
import UnwrapOperation from '../../../../../src/model/operation/unwrapoperation';

export function getAttributeDelta( range, key, oldValue, newValue, version ) {
	const delta = new AttributeDelta();
	delta.addOperation( new AttributeOperation( range, key, oldValue, newValue, version ) );

	return delta;
}

export function getInsertDelta( position, nodes, version ) {
	const delta = new InsertDelta();
	delta.addOperation( new InsertOperation( position, nodes, version ) );

	wrapInBatch( delta );

	return delta;
}

export function getWeakInsertDelta( position, nodes, version ) {
	const delta = new InsertDelta();
	const insert = new InsertOperation( position, nodes, version );
	insert.shouldReceiveAttributes = true;

	delta.addOperation( insert );

	wrapInBatch( delta );

	return delta;
}

export function getMarkerDelta( name, oldRange, newRange, version ) {
	const delta = new MarkerDelta();
	delta.addOperation( new MarkerOperation( name, oldRange, newRange, version ) );

	wrapInBatch( delta );

	return delta;
}

export function getMergeDelta( position, howManyInPrev, version ) {
	const delta = new MergeDelta();

	const sourcePosition = Position.createFromPosition( position );
	sourcePosition.path.push( 0 );

	const targetPosition = Position.createFromPosition( position );
	targetPosition.offset--;
	targetPosition.path.push( howManyInPrev );

	const merge = new MergeOperation( sourcePosition, targetPosition, version );

	delta.addOperation( merge );

	wrapInBatch( delta );

	return delta;
}

export function getMoveDelta( sourcePosition, howMany, targetPosition, baseVersion ) {
	const delta = new MoveDelta();

	const move = new MoveOperation( sourcePosition, howMany, targetPosition, baseVersion );
	delta.addOperation( move );

	wrapInBatch( delta );

	return delta;
}

export function getRemoveDelta( sourcePosition, howMany, baseVersion ) {
	const delta = new RemoveDelta();

	const gy = sourcePosition.root.document.graveyard;
	const gyPos = Position.createAt( gy, 0 );

	const remove = new RemoveOperation( sourcePosition, howMany, gyPos, baseVersion );
	delta.addOperation( remove );

	wrapInBatch( delta );

	return delta;
}

export function getRenameDelta( position, oldName, newName, baseVersion ) {
	const delta = new RenameDelta();

	const rename = new RenameOperation( position, oldName, newName, baseVersion );
	delta.addOperation( rename );

	wrapInBatch( delta );

	return delta;
}

export function getSplitDelta( position, version ) {
	const delta = new SplitDelta();

	delta.addOperation( new SplitOperation( position, version ) );

	wrapInBatch( delta );

	return delta;
}

export function getWrapDelta( range, element, version ) {
	const delta = new WrapDelta();

	const howMany = range.end.offset - range.start.offset;
	delta.addOperation( new WrapOperation( range.start, howMany, element, version ) );

	wrapInBatch( delta );

	return delta;
}

export function getUnwrapDelta( positionBefore, howManyChildren, version ) {
	const delta = new UnwrapDelta();

	const path = positionBefore.path.slice();
	path.push( 0 );
	const position = new Position( positionBefore.root, path );

	delta.addOperation( new UnwrapOperation( position, howManyChildren, version ) );

	wrapInBatch( delta );

	return delta;
}

export function expectDelta( delta, expected ) {
	expect( delta ).to.be.instanceof( expected.type );
	expect( delta.operations.length ).to.equal( expected.operations.length );

	for ( let i = 0; i < delta.operations.length; i++ ) {
		expectOperation( delta.operations[ i ], expected.operations[ i ] );
	}
}

export function expectOperation( op, params ) {
	for ( const i in params ) {
		if ( i == 'type' ) {
			expect( op, 'operation type' ).to.be.instanceof( params[ i ] );
		}
		else if ( i == 'nodes' ) {
			expect( Array.from( op.nodes ), 'nodes' ).to.deep.equal( params[ i ] );
		} else if ( params[ i ] instanceof Position || params[ i ] instanceof Range ) {
			expect( op[ i ].isEqual( params[ i ] ), 'property ' + i ).to.be.true;
		} else {
			expect( op[ i ], 'property ' + 1 ).to.equal( params[ i ] );
		}
	}
}

export function applyDelta( delta, document ) {
	for ( const op of delta.operations ) {
		document.model.applyOperation( op );
	}
}

export function getFilledDocument() {
	const model = new Model();
	const doc = model.document;
	const root = doc.createRoot();

	root._insertChild( 0, [
		new Element( 'x' ),
		new Element( 'x' ),
		new Element( 'x', [], new Text( 'a' ) ),
		new Element( 'div', [], [
			new Element( 'x' ),
			new Element( 'x' ),
			new Element( 'x', [], new Text( 'a' ) ),
			new Element( 'div', [], [
				new Element( 'x' ),
				new Element( 'x' ),
				new Element( 'x', [], new Text( 'abcd' ) ),
				new Element( 'p', [], new Text( 'abcfoobarxyz' ) )
			] )
		] )
	] );

	return doc;
}

function wrapInBatch( delta ) {
	// Batch() requires the document but only a few lines of code needs batch in `document#changes`
	// so we may have an invalid batch instance for some tests.
	const batch = new Batch();

	batch.addDelta( delta );
}
